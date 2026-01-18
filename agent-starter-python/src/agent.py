import logging
import json
import os

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    cli,
    function_tool,
    inference,
    room_io,
)
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from transcript_manager import TranscriptManager

logger = logging.getLogger("agent")

load_dotenv(".env.local")


class ContextAwareAssistant(Agent):
    def __init__(
        self,
        instructions: str,
        transcript_manager: TranscriptManager,
        playback_state_ref: dict,
    ) -> None:
        super().__init__(instructions=instructions)
        self.transcript_manager = transcript_manager
        self.playback_state_ref = playback_state_ref

    @function_tool
    async def get_story_context(self, context: RunContext) -> str:
        """Get current story context based on playback position.

        Use this tool when you need to reference what has happened in the story.
        Returns the text that has been heard so far (last 3 minutes of content).
        """
        current_time = self.playback_state_ref.get("current_time", 0)
        logger.info(f"get_story_context called at playback time: {current_time:.1f}s")

        story_context = self.transcript_manager.get_context_at_time(
            current_time, context_window_seconds=180
        )

        logger.info(
            f"Context: {story_context['word_count']} words, "
            f"{story_context['estimated_position']:.1f}% through story"
        )

        return story_context["heard_so_far"]

    @function_tool
    async def check_if_character_appeared(
        self, context: RunContext, character_name: str
    ) -> str:
        """Check if a character has appeared in the story so far.

        Args:
            character_name: Name of character to check (e.g., "queen", "prince", "dwarfs")

        Returns:
            "yes" if mentioned, "no" if not yet appeared
        """
        current_time = self.playback_state_ref.get("current_time", 0)
        has_appeared = self.transcript_manager.check_character_appeared(
            current_time, character_name
        )

        if has_appeared:
            return f"yes, {character_name} has appeared in the story"
        else:
            return f"no, {character_name} has not been mentioned yet (avoid spoilers!)"

    # To add tools, use the @function_tool decorator.
    # Here's an example that adds a simple weather tool.
    # You also have to add `from livekit.agents import function_tool, RunContext` to the top of this file
    # @function_tool
    # async def lookup_weather(self, context: RunContext, location: str):
    #     """Use this tool to look up current weather information in the given location.
    #
    #     If the location is not supported by the weather service, the tool will indicate this. You must tell the user the location's weather is unavailable.
    #
    #     Args:
    #         location: The location to look up weather information for (e.g. city name)
    #     """
    #
    #     logger.info(f"Looking up weather for {location}")
    #
    #     return "sunny with a temperature of 70 degrees."


server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session()
async def my_agent(ctx: JobContext):
    # Logging setup
    # Add any other context you want in all log entries here
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # Set up a voice AI pipeline using OpenAI, Cartesia, AssemblyAI, and the LiveKit turn detector
    session = AgentSession(
        # Speech-to-text (STT) is your agent's ears, turning the user's speech into text that the LLM can understand
        # See all available models at https://docs.livekit.io/agents/models/stt/
        stt=inference.STT(model="assemblyai/universal-streaming", language="en"),
        # A Large Language Model (LLM) is your agent's brain, processing user input and generating a response
        # See all available models at https://docs.livekit.io/agents/models/llm/
        llm=inference.LLM(model="openai/gpt-4.1-mini"),
        # Text-to-speech (TTS) is your agent's voice, turning the LLM's text into speech that the user can hear
        # See all available models as well as voice selections at https://docs.livekit.io/agents/models/tts/
        tts=inference.TTS(
            model="cartesia/sonic-3", voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
        ),
        # VAD and turn detection are used to determine when the user is speaking and when the agent should respond
        # See more at https://docs.livekit.io/agents/build/turns
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        # allow the LLM to generate a response while waiting for the end of turn
        # See more at https://docs.livekit.io/agents/build/audio/#preemptive-generation
        preemptive_generation=True,
    )

    # To use a realtime model instead of a voice pipeline, use the following session setup instead.
    # (Note: This is for the OpenAI Realtime API. For other providers, see https://docs.livekit.io/agents/models/realtime/))
    # 1. Install livekit-agents[openai]
    # 2. Set OPENAI_API_KEY in .env.local
    # 3. Add `from livekit.plugins import openai` to the top of this file
    # 4. Use the following session setup instead of the version above
    # session = AgentSession(
    #     llm=openai.realtime.RealtimeModel(voice="marin")
    # )

    # # Add a virtual avatar to the session, if desired
    # # For other providers, see https://docs.livekit.io/agents/models/avatar/
    # avatar = hedra.AvatarSession(
    #   avatar_id="...",  # See https://docs.livekit.io/agents/models/avatar/plugins/hedra
    # )
    # # Start the avatar and wait for it to join
    # await avatar.start(session, room=ctx.room)

    # Track playback state from frontend
    playback_state = {"status": "paused", "current_time": 0}

    def handle_data_received(data: rtc.DataPacket):
        """Handle data channel messages from frontend"""
        nonlocal playback_state
        try:
            message = json.loads(data.data.decode("utf-8"))
            if message.get("type") == "playback_state":
                # Update the dict in place to preserve reference
                playback_state.clear()
                playback_state.update(message)
                current_time = playback_state.get("current_time", 0)
                status = playback_state.get("status", "unknown")
                logger.info(f"📊 Playback state update: {current_time:.1f}s ({status})")
        except Exception as e:
            logger.error(f"Error handling data: {e}")

    # Listen for data packets
    ctx.room.on("data_received", handle_data_received)

    async def send_audiobook_command(action: str, **kwargs):
        """Send control commands to the audiobook player"""
        command = {"action": action, **kwargs}
        data = json.dumps(command).encode("utf-8")
        await ctx.room.local_participant.publish_data(data, reliable=True)

    # Load audiobook metadata
    audiobooks_json_path = os.path.join(
        os.path.dirname(__file__),
        "../../agent-starter-react/public/audiobooks.json",
    )
    try:
        with open(audiobooks_json_path, "r") as f:
            audiobooks = json.load(f)
            audiobook_metadata = audiobooks[0]  # Use first audiobook
            logger.info(f"Loaded audiobook metadata: {audiobook_metadata['title']} by {audiobook_metadata['author']}")
    except Exception as e:
        logger.error(f"Failed to load audiobook metadata: {e}")
        audiobook_metadata = {
            "title": "Unknown",
            "author": "Unknown",
            "duration": 0
        }

    # Load transcript manager for context-aware responses
    # Try to get transcript filename from metadata, otherwise derive from ID
    transcript_filename = audiobook_metadata.get("transcript_file")

    if not transcript_filename:
        # Derive from ID: "snow-white-001" -> "snow_white_trans.txt"
        audiobook_id = audiobook_metadata.get("id", "unknown")
        # Remove trailing numbers and convert to snake_case
        base_name = audiobook_id.rsplit("-", 1)[0].replace("-", "_")
        transcript_filename = f"{base_name}_trans.txt"

    transcript_path = os.path.join(
        os.path.dirname(__file__),
        "../../agent-starter-react/public/transcript",
        transcript_filename,
    )

    # Fallback if file doesn't exist
    if not os.path.exists(transcript_path):
        logger.warning(f"Transcript not found at {transcript_path}")
        # Try to find any transcript file in the directory
        transcript_dir = os.path.join(
            os.path.dirname(__file__),
            "../../agent-starter-react/public/transcript"
        )
        if os.path.exists(transcript_dir):
            transcript_files = [f for f in os.listdir(transcript_dir) if f.endswith(".txt")]
            if transcript_files:
                transcript_path = os.path.join(transcript_dir, transcript_files[0])
                logger.info(f"Using fallback transcript: {transcript_files[0]}")
            else:
                logger.error("No transcript files found!")
        else:
            logger.error(f"Transcript directory not found: {transcript_dir}")

    transcript_manager = TranscriptManager(transcript_path, estimated_wpm=120)
    logger.info(
        f"Loaded transcript: {transcript_manager.total_words} words, "
        f"estimated duration: {transcript_manager.get_total_duration_estimate():.0f}s"
    )

    def create_context_aware_instructions() -> str:
        """Generate instructions that rely on function tools for current context"""
        duration_minutes = int(audiobook_metadata.get("duration", 0) / 60)

        instructions = f"""You are a helpful voice AI audiobook companion.
The user is listening to {audiobook_metadata['title']}.

**Audiobook Information:**
- Title: {audiobook_metadata['title']}
- Author: {audiobook_metadata['author']}
- Total Duration: approximately {duration_minutes} minutes

**CRITICAL SPOILER PREVENTION RULE:**
- Only discuss events, characters, and plot points from the story that have been heard so far
- NEVER mention anything that hasn't happened yet in the audiobook
- If asked about future events, say: "No spoilers! Keep listening to find out!"

**IMPORTANT - Using the get_story_context Tool:**
- ALWAYS use the get_story_context tool when the user asks about the story
- This tool gives you the last 3 minutes of story content based on current playback position
- It automatically prevents spoilers by only including what has been heard

**How to Answer Questions:**
- Answer the SPECIFIC question the user asks
- Don't just summarize what happened - address their actual question
- Use the story context to find relevant information
- If the answer isn't in what they've heard yet, say so without spoiling

**Response Guidelines:**
- Be concise and conversational (1-2 sentences for simple questions)
- Answer exactly what was asked, not more
- Speak naturally without formatting symbols or emojis
- Reference specific story details when relevant

**Question Types & How to Handle:**
- "What happened?" or "What's going on?" → Briefly summarize recent key events
- "Who is [character]?" → Explain that character based on what's been heard about them
- "Why did [X] happen?" → Explain the reason if it was mentioned
- "What's [character] doing?" → Describe their current situation in the story
- "Where is [character]?" → Answer based on what's been heard
- "What happens next/at the end?" → "No spoilers! Keep listening to find out!"

**Example Responses:**
- User: "Who is the huntsman?"
  → "The huntsman is the one the queen sent to take Snow White into the woods."

- User: "Why did Snow White run away?"
  → "The huntsman showed her mercy and told her to flee because the queen wanted her dead."

- User: "What just happened?"
  → "Snow White just found the dwarves' cottage in the woods and went inside."

Remember: Answer the specific question asked. Be helpful and informative without spoiling future events!"""

        return instructions

    # Create context-aware agent with dynamic instructions
    initial_instructions = create_context_aware_instructions()
    logger.info("Created context-aware instructions")

    # Start the session, which initializes the voice pipeline and warms up the models
    await session.start(
        agent=ContextAwareAssistant(
            initial_instructions, transcript_manager, playback_state
        ),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: noise_cancellation.BVCTelephony()
                if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                else noise_cancellation.BVC(),
            ),
        ),
    )

    # Join the room and connect to the user
    await ctx.connect()

    # State machine for audiobook control
    was_playing_before_interruption = False
    user_is_in_conversation = False
    resume_pending = False  # Track if we've sent a resume command
    conversation_timeout_task = None
    import asyncio

    async def reset_conversation_after_timeout():
        """Reset conversation state after user stops talking for a while"""
        nonlocal was_playing_before_interruption, user_is_in_conversation, resume_pending
        await asyncio.sleep(3.0)  # Wait 3 seconds of silence
        logger.info("⏱️ Conversation timeout - resetting state")
        user_is_in_conversation = False
        was_playing_before_interruption = False
        resume_pending = False

    @session.on("user_state_changed")
    def on_user_state_changed(event):
        """User state changed - pause when user speaks"""
        nonlocal was_playing_before_interruption, user_is_in_conversation, conversation_timeout_task, resume_pending

        logger.info(f"👤 User state: {event.old_state} → {event.new_state}")

        if event.new_state == "speaking":
            # Cancel any pending timeout
            if conversation_timeout_task and not conversation_timeout_task.done():
                conversation_timeout_task.cancel()

            # Only remember playback state on FIRST interruption
            if not user_is_in_conversation:
                was_playing_before_interruption = playback_state.get("status") == "playing"
                logger.info(f"🎙️ User started speaking. Audiobook was: {'playing' if was_playing_before_interruption else 'paused'}")

            user_is_in_conversation = True

            # Pause audiobook if it's playing OR if resume is pending
            if playback_state.get("status") == "playing" or resume_pending:
                logger.info(f"⏸️ Pausing audiobook (playing={playback_state.get('status')}, resume_pending={resume_pending})")
                asyncio.create_task(send_audiobook_command("pause_audiobook"))
                resume_pending = False
                # Remember we were playing if resume was pending
                if resume_pending and not was_playing_before_interruption:
                    was_playing_before_interruption = True
                    logger.info("📝 Updated was_playing=True (interrupted during resume)")

        elif event.new_state == "listening":
            # User stopped speaking - start timeout to reset conversation
            logger.info("👂 User stopped speaking, waiting for agent response...")

    @session.on("agent_state_changed")
    def on_agent_state_changed(event):
        """Agent state changed - resume when agent finishes speaking"""
        nonlocal was_playing_before_interruption, user_is_in_conversation, conversation_timeout_task, resume_pending

        logger.info(f"🤖 Agent state: {event.old_state} → {event.new_state}")

        if event.new_state == "listening" and event.old_state == "speaking":
            # Agent finished speaking
            logger.info(f"✅ Agent finished. Should resume? was_playing={was_playing_before_interruption}, in_convo={user_is_in_conversation}")

            if was_playing_before_interruption and user_is_in_conversation:
                logger.info("▶️ Resuming audiobook after agent response")
                resume_pending = True  # Mark that resume is pending
                asyncio.create_task(send_audiobook_command("resume_audiobook"))
                # Reset flags
                was_playing_before_interruption = False
                user_is_in_conversation = False

                # Cancel any pending timeout
                if conversation_timeout_task and not conversation_timeout_task.done():
                    conversation_timeout_task.cancel()

                # Clear resume_pending after the delay (2.5s + buffer)
                async def clear_resume_pending():
                    await asyncio.sleep(3.0)
                    nonlocal resume_pending
                    resume_pending = False
                    logger.info("✓ Resume completed, cleared pending flag")

                asyncio.create_task(clear_resume_pending())
            else:
                # Start timeout to reset conversation state
                conversation_timeout_task = asyncio.create_task(reset_conversation_after_timeout())


if __name__ == "__main__":
    cli.run_app(server)

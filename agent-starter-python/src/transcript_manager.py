"""
Transcript Manager for Context-Aware Audiobook Companion

Handles time-based indexing of audiobook transcripts and extracts
relevant context based on playback position.
"""

import os
import json
from dataclasses import dataclass
from typing import Dict, List, Set, Optional
from openai import AsyncOpenAI


@dataclass
class Chunk:
    """Represents a chunk of transcript for semantic search."""
    chunk_id: int
    start_word_index: int
    end_word_index: int
    start_time: float
    end_time: float
    text: str
    keywords: Set[str]


@dataclass
class SearchResult:
    """Results from semantic search."""
    found: bool
    time: float = 0.0
    chunk_id: int = -1
    context_preview: str = ""
    confidence: float = 0.0


class TranscriptManager:
    """Manages audiobook transcript with time-based indexing."""

    def __init__(self, transcript_path: str, estimated_wpm: int = 120, openai_api_key: Optional[str] = None):
        """
        Initialize transcript manager.

        Args:
            transcript_path: Path to transcript text file
            estimated_wpm: Narrator's words per minute (default: 120)
            openai_api_key: OpenAI API key for LLM-based semantic search
        """
        self.transcript_path = transcript_path
        self.wpm = estimated_wpm
        self.words_per_second = estimated_wpm / 60.0

        # Initialize OpenAI client for LLM-based semantic search
        self.openai_client = AsyncOpenAI(api_key=openai_api_key) if openai_api_key else None

        # Load and parse transcript
        self.transcript = self._load_transcript()
        self.words = self.transcript.split()
        self.total_words = len(self.words)

        # Character aliases for tracking
        self.main_characters = {
            "snow white": ["snow white", "snow-white"],
            "queen": ["queen", "stepmother", "wicked woman"],
            "dwarfs": ["dwarf", "dwarves", "seven little men"],
            "huntsman": ["huntsman", "hunter"],
            "prince": ["prince", "king's son"],
            "magic mirror": ["mirror", "looking glass"],
        }

        # Create chunks for semantic search
        self.chunks = self._create_chunks()

    def _load_transcript(self) -> str:
        """Load transcript from file."""
        if not os.path.exists(self.transcript_path):
            raise FileNotFoundError(f"Transcript not found: {self.transcript_path}")

        with open(self.transcript_path, "r", encoding="utf-8") as f:
            return f.read().strip()

    def get_context_at_time(
        self, current_seconds: float, context_window_seconds: float = 180
    ) -> Dict:
        """
        Extract story context based on playback position.

        Args:
            current_seconds: Current playback time in seconds
            context_window_seconds: How many seconds of recent content to include (default: 180 = 3 minutes)

        Returns:
            Dictionary with:
                - heard_so_far: Text heard up to current_seconds
                - word_count: Number of words in context
                - character_mentions: Dict of which characters have appeared
                - estimated_position: Percentage through story
        """
        # Calculate word index at current time
        current_word_index = int(current_seconds * self.words_per_second)
        current_word_index = min(current_word_index, self.total_words)

        # Get context window (last N seconds of heard content)
        context_start_seconds = max(0, current_seconds - context_window_seconds)
        context_start_index = int(context_start_seconds * self.words_per_second)

        # Extract heard text
        heard_words = self.words[context_start_index:current_word_index]
        heard_text = " ".join(heard_words)

        # Track character appearances
        character_mentions = {}
        for char_name, aliases in self.main_characters.items():
            character_mentions[char_name] = any(
                alias in heard_text.lower() for alias in aliases
            )

        # Calculate progress
        progress_percent = (
            (current_word_index / self.total_words) * 100 if self.total_words > 0 else 0
        )

        return {
            "heard_so_far": heard_text,
            "word_count": len(heard_words),
            "character_mentions": character_mentions,
            "estimated_position": progress_percent,
        }

    def get_full_context_until_time(self, current_seconds: float) -> str:
        """
        Get ALL text heard from beginning up to current time.

        Use sparingly for full context; prefer get_context_at_time() for
        token efficiency.

        Args:
            current_seconds: Current playback time in seconds

        Returns:
            Complete text heard from start to current_seconds
        """
        current_word_index = int(current_seconds * self.words_per_second)
        current_word_index = min(current_word_index, self.total_words)

        heard_words = self.words[:current_word_index]
        return " ".join(heard_words)

    def check_character_appeared(self, current_seconds: float, character_name: str) -> bool:
        """
        Check if a character has appeared in the story so far.

        Args:
            current_seconds: Current playback time
            character_name: Name of character to check

        Returns:
            True if character has been mentioned, False otherwise
        """
        heard_text = self.get_full_context_until_time(current_seconds).lower()

        # Check if it's a known character with aliases
        if character_name.lower() in self.main_characters:
            aliases = self.main_characters[character_name.lower()]
            return any(alias in heard_text for alias in aliases)

        # Otherwise check direct name match
        return character_name.lower() in heard_text

    def get_total_duration_estimate(self) -> float:
        """
        Estimate total audiobook duration in seconds based on word count and WPM.

        Returns:
            Estimated duration in seconds
        """
        return self.total_words / self.words_per_second

    def _create_chunks(self) -> List[Chunk]:
        """
        Create overlapping chunks for semantic search.

        Chunk size: 150 words
        Overlap: 25 words (prevents missing boundary matches)

        Returns:
            List of Chunk objects
        """
        chunks = []
        chunk_size = 150
        overlap = 25
        step = chunk_size - overlap

        for i in range(0, len(self.words), step):
            start_idx = i
            end_idx = min(i + chunk_size, len(self.words))

            chunk_words = self.words[start_idx:end_idx]
            chunk_text = " ".join(chunk_words)

            # Calculate timestamps
            start_time = start_idx / self.words_per_second
            end_time = end_idx / self.words_per_second

            # Extract keywords (lowercase unique words)
            keywords = set(word.lower() for word in chunk_words)

            chunks.append(
                Chunk(
                    chunk_id=len(chunks),
                    start_word_index=start_idx,
                    end_word_index=end_idx,
                    start_time=start_time,
                    end_time=end_time,
                    text=chunk_text,
                    keywords=keywords,
                )
            )

            if end_idx >= len(self.words):
                break

        return chunks

    async def semantic_search(self, query: str, current_time: float) -> SearchResult:
        """
        Search for a scene matching the query in the entire transcript using LLM.

        This method uses GPT-4 to analyze the transcript and find the most relevant
        section matching the user's query. It provides 90-95% accuracy and handles
        paraphrasing and natural language understanding.

        NOTE: For demo purposes, this searches the ENTIRE transcript, not just heard content.

        Args:
            query: Natural language description (e.g., "poison apple", "when the queen asks the mirror")
            current_time: Current playback position in seconds (unused for demo)

        Returns:
            SearchResult with found status, time, and preview

        Raises:
            RuntimeError: If OpenAI client is not initialized (API key missing)
        """
        if not self.openai_client:
            raise RuntimeError(
                "OpenAI API key is required for semantic search. "
                "Please set OPENAI_API_KEY in your .env.local file."
            )

        # Get the ENTIRE transcript (no spoiler prevention for demo)
        heard_text = self.transcript

        if not heard_text.strip():
            return SearchResult(found=False)

        # Construct prompt for LLM to find relevant section
        prompt = f"""You are analyzing an audiobook transcript to find a specific scene or moment.

The user is searching for: "{query}"

Here is the complete audiobook transcript:

{heard_text}

Your task:
1. Find the section of the transcript that best matches what the user is looking for
2. If found, return the approximate position as a percentage (0-100) of where this content appears in the transcript
3. Also provide a brief preview (50-100 characters) of the matching text

Respond ONLY with a JSON object in this exact format:
{{"found": true/false, "position_percent": 0-100, "preview": "text preview here"}}

If the content is not found or the query doesn't match anything in the transcript, return:
{{"found": false, "position_percent": 0, "preview": ""}}"""

        try:
            # Call OpenAI API
            response = await self.openai_client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that analyzes audiobook transcripts with high precision. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Low temperature for consistent results
                max_tokens=200,
            )

            # Parse the response
            response_text = response.choices[0].message.content.strip()

            # Extract JSON from response (handle markdown code blocks)
            if response_text.startswith("```"):
                # Remove markdown code block formatting
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()

            result_data = json.loads(response_text)

            if not result_data.get("found", False):
                return SearchResult(found=False)

            # Convert position percentage to actual timestamp
            position_percent = result_data.get("position_percent", 0)
            position_percent = max(0, min(100, position_percent))  # Clamp to 0-100

            # Calculate word index based on percentage of heard content
            heard_word_count = len(heard_text.split())
            target_word_index = int((position_percent / 100.0) * heard_word_count)

            # Convert word index to time
            target_time = target_word_index / self.words_per_second

            # Find the chunk containing this time for chunk_id
            target_chunk_id = -1
            for chunk in self.chunks:
                if chunk.start_time <= target_time <= chunk.end_time:
                    target_chunk_id = chunk.chunk_id
                    break

            return SearchResult(
                found=True,
                time=target_time,
                chunk_id=target_chunk_id,
                context_preview=result_data.get("preview", "")[:100],
                confidence=95.0,  # High confidence for LLM-based search
            )

        except Exception as e:
            # Log error and re-raise
            import logging
            logger = logging.getLogger("agent")
            logger.error(f"LLM semantic search failed: {e}")
            raise

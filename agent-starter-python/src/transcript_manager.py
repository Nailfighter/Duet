"""
Transcript Manager for Context-Aware Audiobook Companion

Handles time-based indexing of audiobook transcripts and extracts
relevant context based on playback position.
"""

import os
from typing import Dict


class TranscriptManager:
    """Manages audiobook transcript with time-based indexing."""

    def __init__(self, transcript_path: str, estimated_wpm: int = 120):
        """
        Initialize transcript manager.

        Args:
            transcript_path: Path to transcript text file
            estimated_wpm: Narrator's words per minute (default: 120)
        """
        self.transcript_path = transcript_path
        self.wpm = estimated_wpm
        self.words_per_second = estimated_wpm / 60.0

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

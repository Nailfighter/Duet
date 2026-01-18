"""
Unit tests for TranscriptManager
"""

import pytest
from src.transcript_manager import TranscriptManager


@pytest.fixture
def transcript_manager():
    """Create transcript manager for Snow White"""
    return TranscriptManager(
        "agent-starter-react/public/transcript/snow_white_trans.txt", estimated_wpm=120
    )


def test_transcript_loads(transcript_manager):
    """Test that transcript loads successfully"""
    assert transcript_manager.total_words > 0
    assert transcript_manager.transcript is not None
    assert len(transcript_manager.transcript) > 0


def test_context_extraction_at_start(transcript_manager):
    """Test context at beginning of audiobook"""
    context = transcript_manager.get_context_at_time(current_seconds=30)

    # Check that opening text is present
    assert "it was the middle of winter" in context["heard_so_far"].lower()
    assert context["word_count"] > 0
    assert context["estimated_position"] < 5  # Less than 5% through story


def test_context_extraction_at_middle(transcript_manager):
    """Test context extraction in middle of story"""
    # At 5 minutes (300 seconds) into audiobook
    context = transcript_manager.get_context_at_time(current_seconds=300)

    assert context["word_count"] > 0
    assert 10 < context["estimated_position"] < 50  # Somewhere in middle


def test_spoiler_prevention_early_in_story(transcript_manager):
    """Test that future content is not included early in story"""
    # Get context at 2 minutes in
    context = transcript_manager.get_context_at_time(current_seconds=120)

    # Ending elements should NOT be in early context
    heard_text = context["heard_so_far"].lower()
    assert "glass coffin" not in heard_text
    assert "prince" not in heard_text  # Prince comes much later


def test_character_tracking_early(transcript_manager):
    """Test character mention detection at start"""
    context = transcript_manager.get_context_at_time(current_seconds=60)

    # Snow White and Queen should be mentioned early
    assert context["character_mentions"]["snow white"] is True
    assert context["character_mentions"]["queen"] is True

    # Prince should NOT be mentioned yet
    assert context["character_mentions"]["prince"] is False


def test_character_tracking_late(transcript_manager):
    """Test character tracking near end of story"""
    # Near end of audiobook
    duration_estimate = transcript_manager.get_total_duration_estimate()
    context = transcript_manager.get_context_at_time(
        current_seconds=duration_estimate - 60
    )

    # Most characters should have appeared by end
    assert context["character_mentions"]["snow white"] is True
    assert context["character_mentions"]["queen"] is True
    assert context["character_mentions"]["dwarfs"] is True
    assert context["character_mentions"]["prince"] is True


def test_context_window(transcript_manager):
    """Test that context window limits text correctly"""
    # Small context window (30 seconds)
    context_small = transcript_manager.get_context_at_time(
        current_seconds=300, context_window_seconds=30
    )

    # Large context window (180 seconds)
    context_large = transcript_manager.get_context_at_time(
        current_seconds=300, context_window_seconds=180
    )

    # Large window should have more words
    assert context_large["word_count"] > context_small["word_count"]


def test_full_context_until_time(transcript_manager):
    """Test getting full context from start to current time"""
    full_context = transcript_manager.get_full_context_until_time(current_seconds=120)

    assert len(full_context) > 0
    assert "snow white" in full_context.lower()
    assert full_context.startswith("snow white by the brothers grimm")


def test_check_character_appeared(transcript_manager):
    """Test character appearance checking"""
    # At beginning
    assert transcript_manager.check_character_appeared(30, "snow white") is True
    assert transcript_manager.check_character_appeared(30, "queen") is True
    assert transcript_manager.check_character_appeared(30, "prince") is False

    # Near end
    duration_estimate = transcript_manager.get_total_duration_estimate()
    assert (
        transcript_manager.check_character_appeared(duration_estimate - 60, "prince")
        is True
    )


def test_wpm_calculation(transcript_manager):
    """Test that WPM calculations are reasonable"""
    # At 120 WPM, we should process 2 words per second
    assert transcript_manager.words_per_second == 2.0

    # Estimated duration should be reasonable for 3000+ words
    duration = transcript_manager.get_total_duration_estimate()
    assert 1000 < duration < 2000  # Between 16-33 minutes


def test_edge_case_zero_seconds(transcript_manager):
    """Test context at time zero"""
    context = transcript_manager.get_context_at_time(current_seconds=0)

    assert context["word_count"] == 0
    assert context["estimated_position"] == 0
    assert context["heard_so_far"] == ""


def test_edge_case_beyond_duration(transcript_manager):
    """Test context beyond audiobook duration"""
    # Request context way beyond actual duration
    context = transcript_manager.get_context_at_time(current_seconds=10000)

    # Should return full transcript
    assert context["estimated_position"] == 100
    assert context["word_count"] == transcript_manager.total_words

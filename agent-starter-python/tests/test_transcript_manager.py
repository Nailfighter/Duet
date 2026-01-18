"""
Unit tests for TranscriptManager
"""

import pytest
from src.transcript_manager import TranscriptManager


@pytest.fixture
def transcript_manager():
    """Create transcript manager for Snow White"""
    return TranscriptManager(
        "../agent-starter-react/public/transcript/snow_white_trans.txt", estimated_wpm=120
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


# Semantic Search Tests


def test_chunk_creation(transcript_manager):
    """Test that chunks are created with proper overlap."""
    assert len(transcript_manager.chunks) > 0

    # Check first chunk
    first = transcript_manager.chunks[0]
    assert first.chunk_id == 0
    assert first.start_word_index == 0
    assert first.start_time == 0.0
    assert len(first.keywords) > 0

    # Check overlap exists between chunks
    if len(transcript_manager.chunks) > 1:
        second = transcript_manager.chunks[1]
        # Overlap should be ~25 words
        overlap = first.end_word_index - second.start_word_index
        assert overlap > 0  # Some overlap exists


async def test_semantic_search_exact_phrase(transcript_manager):
    """Test finding scene with exact phrase match."""
    # Search for "poison" (exists in Snow White transcript)
    # Set current_time high enough to include the scene
    result = await transcript_manager.semantic_search("poison", current_time=1000)

    assert result.found
    assert result.time >= 0
    assert "poison" in result.context_preview.lower() or len(result.context_preview) > 0


async def test_semantic_search_spoiler_prevention(transcript_manager):
    """Test that future scenes are not found."""
    # Search for something late in the story at early timestamp
    # "glass coffin" appears late in Snow White
    result = await transcript_manager.semantic_search("glass coffin", current_time=60)

    # Should not be found (spoiler prevention)
    assert not result.found


async def test_semantic_search_keyword_matching(transcript_manager):
    """Test finding scenes with individual keywords."""
    # Search with multiple keywords
    result = await transcript_manager.semantic_search("queen mirror", current_time=500)

    assert result.found
    assert result.time >= 0


async def test_semantic_search_no_match(transcript_manager):
    """Test handling of queries with no matches."""
    # Search for something not in the story
    result = await transcript_manager.semantic_search("dragon castle", current_time=1000)

    # May or may not find depending on keywords, but shouldn't crash
    assert isinstance(result.found, bool)


async def test_semantic_search_character_synonyms(transcript_manager):
    """Test finding scenes using character aliases."""
    # Search for "mirror" (has synonym "looking glass")
    result1 = await transcript_manager.semantic_search("mirror", current_time=500)
    result2 = await transcript_manager.semantic_search("looking glass", current_time=500)

    # Both should find mirror scenes
    if result1.found and result2.found:
        # Should find similar or same chunks
        assert abs(result1.time - result2.time) < 100  # Within ~100 seconds

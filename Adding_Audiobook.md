# How to Add New Audiobooks

This guide explains how to add new audiobooks to your Echo AI Audiobook Companion.

## Overview

The system is now fully dynamic and can work with any audiobook. When you add a new audiobook, the agent will automatically:
- Load the correct metadata (title, author, duration)
- Find and load the matching transcript
- Generate appropriate context-aware instructions
- Prevent spoilers based on the new content

## Steps to Add a New Audiobook

### 1. Add the Audio File

Place your audiobook MP3 file in:
```
agent-starter-react/public/audio/your_audiobook.mp3
```

### 2. Add the Cover Image

Place your cover image in:
```
agent-starter-react/public/images/your_audiobook_cover.jpg
```

### 3. Add the Transcript

Create a plain text transcript file in:
```
agent-starter-react/public/transcript/your_audiobook_trans.txt
```

**Transcript Format:**
- Plain text file
- No timestamps needed
- Just the complete text of the audiobook
- The system will map playback time to text using WPM estimation

Example:
```
The Great Gatsby by F. Scott Fitzgerald

In my younger and more vulnerable years my father gave me some advice...
```

### 4. Update audiobooks.json

Add your audiobook entry to:
```
agent-starter-react/public/audiobooks.json
```

**Format:**
```json
[
  {
    "id": "your-audiobook-001",
    "title": "Your Audiobook Title",
    "author": "Author Name",
    "cover_image": "/images/your_audiobook_cover.jpg",
    "audio_file": "/audio/your_audiobook.mp3",
    "duration": 1800,
    "transcript_file": "your_audiobook_trans.txt"
  }
]
```

**Fields:**
- `id`: Unique identifier (kebab-case recommended)
- `title`: Full title of the audiobook
- `author`: Author name
- `cover_image`: Path to cover image (relative to /public)
- `audio_file`: Path to audio file (relative to /public)
- `duration`: Duration in seconds (get this from the audio file metadata)
- `transcript_file`: (Optional) Filename of transcript. If omitted, system will derive from `id`

### 5. File Naming Convention

If you **don't** specify `transcript_file` in the JSON, the system will automatically derive it from the `id`:

**Example:**
- ID: `"great-gatsby-001"` → Transcript: `great_gatsby_trans.txt`
- ID: `"pride-prejudice-002"` → Transcript: `pride_prejudice_trans.txt`

**Rule:** Remove trailing numbers, convert hyphens to underscores, add `_trans.txt`

### 6. Get Audio Duration

To get the duration in seconds:

**On macOS/Linux:**
```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 your_audiobook.mp3
```

**On Windows (with ffmpeg installed):**
```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 your_audiobook.mp3
```

**In Python:**
```python
from mutagen.mp3 import MP3
audio = MP3("your_audiobook.mp3")
print(int(audio.info.length))  # Duration in seconds
```

### 7. Calibrate WPM (Optional)

The system uses 120 WPM by default. If timing feels off:

1. Play exactly 60 seconds of your audiobook
2. Count how many words from the transcript were spoken
3. Update the WPM in `agent.py`:

```python
transcript_manager = TranscriptManager(transcript_path, estimated_wpm=140)  # Adjust here
```

## Example: Adding "The Great Gatsby"

### File Structure:
```
agent-starter-react/public/
├── audio/
│   └── great_gatsby.mp3
├── images/
│   └── great_gatsby_cover.jpg
├── transcript/
│   └── great_gatsby_trans.txt
└── audiobooks.json
```

### audiobooks.json:
```json
[
  {
    "id": "great-gatsby-001",
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "cover_image": "/images/great_gatsby_cover.jpg",
    "audio_file": "/audio/great_gatsby.mp3",
    "duration": 4680,
    "transcript_file": "great_gatsby_trans.txt"
  }
]
```

### great_gatsby_trans.txt:
```
The Great Gatsby by F. Scott Fitzgerald

In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since...

[... full transcript ...]
```

## How the System Works

1. **Agent startup**: Reads `audiobooks.json` and loads the first audiobook entry
2. **Metadata loading**: Extracts title, author, duration
3. **Transcript loading**:
   - Uses `transcript_file` if specified
   - Otherwise derives from `id` (e.g., "great-gatsby-001" → "great_gatsby_trans.txt")
   - Falls back to any `.txt` file in transcript directory if not found
4. **Dynamic instructions**: Agent instructions are generated with the actual title and author
5. **Context-aware responses**: Agent answers questions based on playback position in YOUR audiobook

## Multiple Audiobooks

Currently, the system uses the **first audiobook** in the array (`audiobooks[0]`). To support multiple audiobooks:

### Option 1: Manually Switch
Change which audiobook is first in the array:
```json
[
  {
    "id": "audiobook-you-want",
    ...
  },
  {
    "id": "other-audiobook",
    ...
  }
]
```

### Option 2: Dynamic Selection (Future Enhancement)
You could modify the frontend to:
- Show an audiobook selection UI
- Send the selected audiobook ID via data channel
- Agent loads the corresponding transcript dynamically

## Troubleshooting

### Agent says "Unknown" for title/author
- Check that `audiobooks.json` is valid JSON
- Verify the file path is correct
- Check agent logs for loading errors

### Transcript not found
- Verify transcript filename matches the `transcript_file` field or follows naming convention
- Check that the file exists in `/agent-starter-react/public/transcript/`
- Look for fallback warnings in agent logs

### Timing feels off (spoilers or missing context)
- Calibrate WPM by counting words spoken in 60 seconds
- Adjust `estimated_wpm` in agent.py
- Check that `duration` in audiobooks.json matches actual audio file duration

### Agent gives wrong answers
- Verify transcript matches the audio exactly
- Check playback state is being sent correctly (look for 📊 logs)
- Ensure transcript has no extra formatting or timestamps

## Testing Your New Audiobook

1. Start the Python agent: `cd agent-starter-python && python src/agent.py dev`
2. Start the React frontend: `cd agent-starter-react && npm run dev`
3. Play your audiobook for 2-3 minutes
4. Ask: "What's the title of this audiobook?"
   - **Expected**: Your audiobook title
5. Ask: "What just happened?"
   - **Expected**: Summary of last few minutes
6. Ask: "What happens at the end?"
   - **Expected**: "No spoilers! Keep listening to find out!"

## Tips

- **Transcript quality matters**: Clean, accurate transcripts give better responses
- **Remove timestamps**: Plain text only, no `[00:00]` markers
- **Match exactly**: Transcript should match audio word-for-word
- **Test early**: Add a small audiobook first to verify the system works
- **WPM varies**: Narrators speak at different speeds (100-150 WPM typical range)

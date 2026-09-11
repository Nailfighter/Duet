# syntax=docker/dockerfile:1

# Use the official UV Python base image with Python 3.13 on Debian Bookworm
# UV is a fast Python package manager that provides better performance than pip
# We use the slim variant to keep the image size smaller while still having essential tools
ARG PYTHON_VERSION=3.13
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base

# Keeps Python from buffering stdout and stderr to avoid situations where
# the application crashes without emitting any logs due to buffering.
ENV PYTHONUNBUFFERED=1

# Create a non-privileged user that the app will run under.
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

# Install build dependencies required for Python packages with native extensions
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy just the dependency files first, for more efficient layer caching
COPY agent-starter-python/pyproject.toml agent-starter-python/uv.lock ./
RUN mkdir -p src

# Install Python dependencies using UV's lock file
RUN uv sync --locked

# Copy all remaining application files into the container
COPY agent-starter-python/ .

# Pre-download any ML models the agent needs so the container is ready to run immediately.
# Run as root here since it re-triggers an editable install of the project (writes to
# src/*.egg-info); ownership is fixed up for the non-privileged user afterwards.
RUN uv run src/agent.py download-files

# Change ownership of all app files to the non-privileged user, then drop root for runtime.
# `uv run` re-checks/re-syncs the editable install on every invocation (writing into
# src/*.egg-info), so appuser needs write access there, not just read.
RUN chown -R appuser:appuser /app && chmod -R u+rwX /app
USER appuser

# Run the application using UV; "start" connects to LiveKit and begins waiting for jobs.
CMD ["uv", "run", "src/agent.py", "start"]

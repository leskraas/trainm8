FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Rename the base image's "node" user to "agent" and align it with the
# host UID/GID that Sandcastle's Docker provider uses via --user.
ARG AGENT_UID=502
ARG AGENT_GID=20
RUN set -eux; \
  if getent group "${AGENT_GID}" >/dev/null; then \
    agent_group="$(getent group "${AGENT_GID}" | cut -d: -f1)"; \
  else \
    groupmod -g "${AGENT_GID}" node; \
    agent_group=node; \
  fi; \
  usermod -d /home/agent -m -l agent -u "${AGENT_UID}" -g "${agent_group}" node; \
  mkdir -p /home/agent/.claude /home/agent/.codex /home/agent/.config; \
  chown -R "${AGENT_UID}:${AGENT_GID}" /home/agent
USER agent

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]

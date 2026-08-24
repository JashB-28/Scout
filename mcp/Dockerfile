# ScoutOne MCP server — thin FastMCP proxy that exposes the research API as
# MCP tools over Streamable HTTP (for claude.ai custom connectors, etc.).
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first so this layer is cached unless requirements change.
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Application code
COPY scout_mcp.py ./

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 appuser
USER appuser

# Serve over HTTP (Streamable) at /mcp on 8765; reached internally via Caddy.
ENV SCOUT_HTTP=1 \
    SCOUT_PORT=8765
EXPOSE 8765

CMD ["python", "scout_mcp.py"]

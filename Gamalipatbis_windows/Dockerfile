FROM python:3.11-alpine

# Set working directory
WORKDIR /app

# Ensure logs are printed in real-time
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Copy the core python source files
COPY src-python/core/ /app/core/

# Expose port 5001
EXPOSE 5001

# Run the API server
CMD ["python", "core/api_server.py"]

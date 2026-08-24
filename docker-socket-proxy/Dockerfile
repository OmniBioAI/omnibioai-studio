# #265: minimal, dependency-free (stdlib asyncio only) policy-enforcing
# proxy sitting between the workbench container and the real host
# docker.sock. See policy.py's module docstring for the threat model.
FROM python:3.12-slim

WORKDIR /app
COPY proxy.py policy.py ./

# Runs as root: it needs to connect to the real docker.sock, which is
# owned by root/the docker group on the host and bind-mounted in. It
# never executes anything itself beyond relaying already-policy-checked
# bytes to that socket -- it is not handed the docker CLI binary or any
# shell.
ENTRYPOINT ["python3", "proxy.py"]

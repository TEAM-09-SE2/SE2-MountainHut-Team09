# Docker release guide

For team members who build and publish the release image. To only run it, see [Run the release with Docker](../README.md#run-the-release-with-docker).

The commands are for bash or zsh. On Windows, run them in Git Bash (installed with Git for Windows).

## How it works

- One image: PostgreSQL 16, the API (port 8080, also serves the frontend) and Mailpit (inbox on port 8025).
- [`start.sh`](../App/docker/start.sh) checks the secrets and starts all three. If one stops, the container stops.
- The API sends every email to Mailpit. With the `MP_SMTP_RELAY_*` settings, Mailpit also sends it through Gmail. If those settings are incomplete, or Gmail does not answer at start, the relay is switched off and the log says why. `@rifugio.it` addresses are never relayed.
- Secrets are never in the image. They come from `secrets.env`, passed with `--env-file`.
- Local development is unchanged: Compose, `App/docker/.env` and `npm run dev` work as before.

| File | Purpose |
| --- | --- |
| [`App/docker/Dockerfile`](../App/docker/Dockerfile) | Builds the image |
| [`App/docker/start.sh`](../App/docker/start.sh) | Entry point |
| [`App/docker/secrets.env.example`](../App/docker/secrets.env.example) | Template of `secrets.env` |
| [`App/docker/HOW-TO-RUN.txt`](../App/docker/HOW-TO-RUN.txt) | One-page start guide that goes into the zip |
| [`App/.dockerignore`](../App/.dockerignore), [`.gitignore`](../.gitignore), [`.gitattributes`](../.gitattributes) | Keep secrets out of the image and git, and keep `start.sh` with Unix line endings |

## 1. Create `secrets.env`

```bash
cp App/docker/secrets.env.example App/docker/secrets.env
```

Fill in `DB_PASSWORD` and `JWT_SECRET` with random values (`openssl rand -hex 32`), and `MP_SMTP_RELAY_PASSWORD` with the Gmail app password (ask the account owner). Use the template, not a development `.env`. Git ignores this file; never commit it.

## 2. Set the version

**Tag convention.** Every image pushed to Docker Hub follows it:

- `sprintN`, where N is the sprint number (`sprint2`, `sprint3`, ...). One tag per sprint release.
- `latest`, always pushed together with the newest `sprintN`.
- A fix before the sprint deadline is pushed again under the same `sprintN`. After the sprint is graded, never push to that tag again.
- No other tags (no names, dates or `test`). To try something, build locally (step 3) and do not push.

The README and the Docker Hub page always use `latest`, so they do not change. **Before building, put the new tag in all of these places:**

| Where | What |
| --- | --- |
| `App/docker/HOW-TO-RUN.txt` | The tag in the `docker run` line, and the sprint number in the title |
| Your `App/docker/secrets.env` | The tag in the comment at the top |

From the repository root (here `sprint2` to `sprint3`; on Linux and Git Bash use `sed -i` without `''`):

```bash
sed -i '' 's/:sprint2/:sprint3/g' App/docker/HOW-TO-RUN.txt
git grep -n ':sprint2' -- App/docker/HOW-TO-RUN.txt   # must print nothing
```

## 3. Build and test

Ports 8080 and 8025 must be free: stop the development Mailpit and Adminer, and any `mountainhut` container. Then, from `App/`:

```bash
docker build -f docker/Dockerfile -t mountainhut:local .
docker run -d --name mountainhut-test \
  --env-file docker/secrets.env \
  -p 127.0.0.1:8080:8080 -p 127.0.0.1:8025:8025 \
  mountainhut:local
```

Check:

- `docker ps` shows `Up ... (healthy)` in the STATUS column of `mountainhut-test`.
- Sign in as Anna and book a table. The email appears in <http://localhost:8025> and in the project inbox.
- `docker logs mountainhut-test` has no `[relay] error`. A wrong app password shows up only there.

Clean up with `docker rm -f -v mountainhut-test`.

## 4. Publish

Once per machine, with an access token of the Docker Hub account `mountainhutteam09` (ask the team):

```bash
docker login -u mountainhutteam09
docker buildx create --use --name mountainhut-builder
```

If your Docker is signed in with your own account, keep it by using a separate config folder for the team account (macOS, Docker Desktop):

```bash
mkdir -m 700 ~/.docker-mountainhut
printf '{ "auths": { "https://index.docker.io/v1/": {} }, "currentContext": "desktop-linux" }\n' > ~/.docker-mountainhut/config.json
ln -s ~/.docker/contexts ~/.docker-mountainhut/contexts
ln -s ~/.docker/cli-plugins ~/.docker-mountainhut/cli-plugins
export DOCKER_CONFIG=~/.docker-mountainhut   # only this terminal uses the team account
```

On Windows, use `docker logout` and `docker login` instead.

Each release, from `App/`, with the tag from step 2:

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -f docker/Dockerfile \
  -t mountainhutteam09/mountainhut:sprintN \
  -t mountainhutteam09/mountainhut:latest \
  --push .
docker buildx imagetools inspect mountainhutteam09/mountainhut:sprintN   # must list linux/amd64 and linux/arm64
```

Then test it like a grader: `docker rm -f mountainhut`, `docker volume rm mountainhut-data`, `docker pull mountainhutteam09/mountainhut:sprintN`, and the command from the README.

## 5. Make the zip

The zip must contain the `HOW-TO-RUN.txt` with the new tag (step 2). From `App/docker`:

```bash
zip -X Team09-secrets.zip secrets.env HOW-TO-RUN.txt
```

On Windows: `Compress-Archive -Path secrets.env, HOW-TO-RUN.txt -DestinationPath Team09-secrets.zip -Force`. Upload it to Elaborati.

## Release checklist

1. All stories are merged into `dev` and the tests pass.
2. Set the version (step 2) and merge it into `dev`.
3. From the latest `dev`: build and test (step 3), then publish (step 4).
4. Make the zip (step 5) and upload it.
5. Merge `dev` into `main` with a merge commit. Graders read the README on `main`.
6. Put the image link in the shared sheet.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing DB_PASSWORD JWT_SECRET` | Start with `--env-file secrets.env` and fill in both values |
| `Email relay off: <reason>` | Fix the reason: an empty relay setting, or a network that blocks Gmail. Emails still reach Mailpit |
| `[relay] error ... 535` | Wrong or revoked app password. Changing the Google password revokes all app passwords |
| An email takes about 10 seconds and is lost | The connection to Gmail stalled. Restart the container |
| Exit code 127, `bad interpreter` | `start.sh` has Windows line endings. Keep `.gitattributes` and the `sed` line in the Dockerfile |
| Sign-in fails in the browser | Leave `NODE_ENV` unset: `production` makes the cookie HTTPS-only |
| Port already in use | Free 8080 and 8025 (step 3), then `docker rm -f -v mountainhut-test` and run again |

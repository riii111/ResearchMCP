FROM denoland/deno:debian AS builder

WORKDIR /app
COPY deno.json main.ts ./
RUN deno cache main.ts || true
COPY . .
RUN deno cache main.ts

FROM denoland/deno:alpine

WORKDIR /app
COPY --from=builder /app /app
EXPOSE 8088
CMD ["run", "--allow-net", "--allow-env", "main.ts"]
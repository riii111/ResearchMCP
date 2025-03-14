FROM denoland/deno:alpine

WORKDIR /app

RUN apk --no-cache add ca-certificates

COPY deno.json ./

RUN deno cache main.ts || true

COPY . .

RUN deno cache main.ts

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-env", "main.ts"]
FROM denoland/deno:debian

WORKDIR /app

COPY deno.json deno.lock* ./
RUN deno cache main.ts

COPY . .
RUN deno cache main.ts

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-env", "main.ts"]
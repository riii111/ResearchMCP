FROM denoland/deno:debian

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    curl \
    vim \
    nano \
    bash \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY deno.json ./

RUN deno cache main.ts || true

COPY . .

RUN deno cache main.ts

EXPOSE 8088

CMD ["run", "--allow-net", "--allow-env", "main.ts"]
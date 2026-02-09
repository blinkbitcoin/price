FROM node:20.20.0-alpine AS BUILD_IMAGE

RUN apk update && apk add python3 make g++

WORKDIR /app
COPY ./*.json ./yarn.lock ./
COPY ./history ./history/

RUN yarn install --frozen-lockfile
RUN yarn workspace history build

RUN rm -rf /app/node_modules
RUN rm -rf /app/history/node_modules
RUN yarn install --frozen-lockfile --production

FROM node:20.20.0-alpine
COPY --from=BUILD_IMAGE /app/history/dist /app
COPY --from=BUILD_IMAGE /app/history/scripts /app/scripts
COPY --from=BUILD_IMAGE /app/node_modules /app/node_modules
COPY --from=BUILD_IMAGE /app/history/node_modules /app/node_modules

WORKDIR /app
COPY ./history/package.json ./history/*.yaml ./

RUN GRPC_HEALTH_PROBE_VERSION=v0.4.18 && \
    wget -qO/bin/grpc_health_probe https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64 && \
    chmod +x /bin/grpc_health_probe

USER 1000

ARG BUILDTIME
ARG COMMITHASH
ENV BUILDTIME ${BUILDTIME}
ENV COMMITHASH ${COMMITHASH}

EXPOSE 9464
EXPOSE 50051

CMD ["servers/history/run.js"]

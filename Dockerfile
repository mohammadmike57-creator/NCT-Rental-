# One service: the Spring Boot server also serves the website (pom.xml copies dist/ into static/).

# ---- Stage 1: build the website (React/Vite) ----
FROM node:22-slim AS frontend
WORKDIR /web
# Render passes its environment variables as build args; the commit is shown in the app's version label.
ARG RENDER_GIT_COMMIT=
ENV RENDER_GIT_COMMIT=$RENDER_GIT_COMMIT
COPY package.json package-lock.json .node-version ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Stage 2: build the server with the website bundled in ----
FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /app
# Retry dropped downloads instead of failing the whole build.
ENV MAVEN_ARGS="-B -Daether.connector.http.retryHandler.count=5 -Daether.connector.requestTimeout=120000"
COPY pom.xml .
# Pre-fetch dependencies (cached between builds); a flaky pre-fetch is retried by the real build below.
RUN mvn dependency:go-offline || true
COPY src ./src
COPY --from=frontend /web/dist ./dist
# The website was built in stage 1 (this image has no npm), so skip pom.xml's npm steps.
RUN mvn clean package -DskipTests -Dexec.skip=true

# ---- Stage 3: small Java runtime only ----
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
# Memory: the whole process must stay under the instance's limit (512 MB on Render's Starter plan), or Render
# restarts it. Outside the heap the server needs about 190 MB (classes, code, threads), measured with realistic data,
# so the heap gets 55% (about 282 MB of 512 MB, against ~180 MB in use; it grows automatically on a larger instance), class metadata and the
# code cache are capped, and a full heap restarts the server cleanly instead of leaving it stuck.
# Small instances get a fraction of one CPU: the serial collector, quick (C1) compilation and smaller
# thread stacks halve start-up time (~22 s -> ~12 s on one core). Render sets PORT.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=55 -XX:MaxMetaspaceSize=160m -XX:ReservedCodeCacheSize=48m -XX:MaxDirectMemorySize=32m -XX:+ExitOnOutOfMemoryError -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss512k"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]

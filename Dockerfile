# One service: the Spring Boot server also serves the website (pom.xml copies dist/ into static/).

# ---- Stage 1: build the website (React/Vite) ----
FROM node:22-slim AS frontend
WORKDIR /web
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
# Use most of the container's memory for the heap; Render sets PORT.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]

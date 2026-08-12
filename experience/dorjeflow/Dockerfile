FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_RUNTIME_PROVIDER=student-lad
ARG VITE_STUDENT_LAD_API_URL=http://localhost:8100/api/v1
ENV VITE_RUNTIME_PROVIDER=$VITE_RUNTIME_PROVIDER
ENV VITE_STUDENT_LAD_API_URL=$VITE_STUDENT_LAD_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

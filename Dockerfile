# Start your image with a node base image
FROM node:18-alpine

# The /app directory should act as the main application directory
WORKDIR /app

# Copy the app package and package-lock.json file
COPY . .

# Copy local directories to the current local directory of our docker image (/app)
# COPY ./src ./src
# COPY ./public ./public

# Install node packages, install serve, build the app, and remove dependencies at the end
RUN npm install


EXPOSE 28000

# Start the app using serve command
CMD ["node", "simulator.js", "filename"]
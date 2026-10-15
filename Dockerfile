FROM mcr.microsoft.com/playwright:v1.59.1-noble
WORKDIR /app

# Install LaTeX compilation dependencies
RUN apt-get update && apt-get install -y texlive-latex-base texlive-fonts-recommended texlive-latex-extra && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
CMD ["npm", "run", "backend"]

# Contributing to TruLens

Thank you for your interest in contributing to TruLens! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [Project Structure](#project-structure)
- [Contribution Workflow](#contribution-workflow)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

We expect all contributors to follow our Code of Conduct. Please be respectful and constructive in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
   ```bash
   git clone https://github.com/your-username/trulens.git
   cd trulens
   ```
3. **Set up the upstream remote**
   ```bash
   git remote add upstream https://github.com/original-owner/trulens.git
   ```
4. **Install dependencies**
   ```bash
   pnpm install
   ```

## Development Environment

### Prerequisites

- Node.js 16+
- PNPM package manager
- Noir v0.31.0 (for circuits)
  ```
  noirup --version 0.31.0
  ```
- Starknet CLI (for smart contract development)

### Setup

1. **Frontend Development**
   ```bash
   cd frontend
   pnpm dev
   ```

2. **Backend Development**
   ```bash
   cd backend
   pnpm dev
   ```

3. **Circuit Development**
   Make sure you have Noir installed at the correct version.
   ```bash
   cd circuits
   nargo check
   ```

4. **Starknet Contract Development**
   ```bash
   cd starknet
   scarb build
   ```

## Project Structure

The project is organized into four main components:

- **frontend/**: React/TypeScript mobile-first web application
- **backend/**: Node.js server with Express API
- **circuits/**: Noir zero-knowledge circuits
- **starknet/**: Cairo smart contracts

## Contribution Workflow

1. **Create a new branch** for your feature or bugfix
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** with clear, documented code

3. **Test your changes** thoroughly

4. **Commit your changes** following commit guidelines

5. **Push your branch** to your fork
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** against the main branch of the upstream repository

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation changes
- **style**: Changes that don't affect code functionality
- **refactor**: Code changes that neither fix bugs nor add features
- **perf**: Performance improvements
- **test**: Adding or correcting tests
- **chore**: Changes to build process or tools

Example:
```
feat(frontend): add image sharing functionality
```

## Pull Request Process

1. Ensure your PR addresses a specific issue or feature
2. Update documentation to reflect any changes
3. Add appropriate tests for your changes
4. Ensure all tests pass
5. Request review from at least one maintainer
6. Address review comments promptly

## Testing

### Frontend
```bash
cd frontend
pnpm test
```

### Backend
```bash
cd backend
pnpm test
```

### Circuits
```bash
cd circuits
nargo test
```

### Starknet Contracts
```bash
cd starknet
snforge test
```

## Documentation

- Comment your code clearly
- Update README.md if introducing new features
- Update Architecture.md for architectural changes
- Provide usage examples for new features

## Component-Specific Guidelines

### Frontend

- Follow the existing style and component patterns
- Use TypeScript for all new code
- Ensure mobile-first responsive design
- Test in multiple browsers (Chrome, Firefox, Safari)

### Backend

- Maintain RESTful API design principles
- Document all API endpoints
- Handle errors gracefully
- Include appropriate logging

### Circuits

- Maintain version compatibility
- Document constraints and assumptions
- Add test vectors for verification

### Smart Contracts

- Keep functions simple and modular
- Document parameter requirements
- Consider gas optimization

## Community

- Join our [Discord server](https://discord.gg/example) for discussion
- Participate in issues and discussions on GitHub
- Share your use cases and suggestions

Thank you for contributing to TruLens!

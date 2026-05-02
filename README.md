<img src="./logo.svg" width="100">

# SortIt - AI-Powered File Organizer

SortIt is a completely local, intelligent file organization tool. It uses AI to analyze your files and automatically propose or apply an organized folder structure based on categories, dates, and metadata.

## Features

- 100% Local Processing: No cloud databases. All state and metadata are stored in a simple db.json file on your machine.
- AI-Powered Organization: Extracts titles, summaries, and keywords to categorize files.
- Smart Sorting: Intelligent parallel processing for bulk file organization.
- Preview First: Review proposed changes before they are applied to your virtual organization.
- Cross-Platform: Runs on Windows, macOS, and Linux.

## Download/Run Binaries

The application binaries for Windows, macOS, and Linux have been pre-built and are available in the root directory:

- `sortit-windows.exe` (Windows)
- `sortit-macos` (macOS)
- `sortit-linux` (Linux)

You can run these directly without needing to install Node.js.

## Running the App Locally (For Developers)

1. Prerequisites: Node.js (v18 or higher).
2. Install Dependencies:

   ```bash
   npm install
   ```

3. Set up Environment:
   Create a .env file and add your Gemini API Key:

   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

4. Start Development Server:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000> in your browser.

## How to Create a Single Combined Executable

The application can be packaged into a single binary that contains both the React frontend and the Express backend.

### 1. Build and Package

Run the following command:

```bash
npm run package
```

### 2. Output

Check the bin/ directory. You will find binaries for:

- sortit-win.exe (Windows)
- sortit-macos (macOS)
- sortit-linux (Linux)

### 3. Bundled Assets

The build process uses esbuild to bundle the server and pkg to bundle the frontend assets (/dist) into the binary. When you run the resulting executable, it will extract and serve the UI directly from the binary itself. No external folders are required for deployment.

## Building with Docker (Recommended)

You can build the binaries for all platforms (Windows, Linux, macOS) using Docker to ensure a clean, consistent build environment.

### 1. Build the Docker Image

```bash
docker build -t sortit-builder .
```

### 2. Extract Binaries

Run these commands to extract the generated binaries from the Docker image to your local `bin/` folder:

```bash
# Create a temporary container
docker create --name temp-sortit sortit-builder

# Copy the binaries to your local bin directory
docker cp temp-sortit:/output/bin ./bin

# Remove the temporary container
docker rm temp-sortit
```

## Technical Details

- Frontend: React 19 + Tailwind CSS + Lucide Icons.
- Backend: Express Server handles local file storage logic.
- Storage: All data resides in db.json in the application path.
- AI: Integrates with Google Gemini (and other providers) via the @google/genai SDK.

## Storage Location

The application stores its configuration and file metadata in:
[Application Path]/db.json

You can verify the exact path in the Settings menu within the app.

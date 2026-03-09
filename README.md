# n8n LLM Agent Dashboard

A beautiful web-based dashboard for viewing and managing AI agents and LLM configurations across your n8n workflows.

![Dashboard Preview](screenshot.png)

## Features

- **Centralized LLM Management** - View all AI agents and their LLM configurations in one place
- **Multi-Provider Support** - Works with OpenAI, Google Gemini, Anthropic, Ollama, Mistral AI, OpenRouter, and more
- **Real-time Model Switching** - Change LLM models directly from the dashboard without opening n8n
- **Smart Detection** - Automatically detects:
  - AI Agent nodes with connected LLMs
  - Basic LLM Chain nodes
  - Native Gemini nodes (for image analysis)
  - Primary/Fallback LLM configurations
- **Mobile Responsive** - Works great on both desktop and mobile devices
- **Auto-refresh** - Keeps your dashboard up-to-date automatically (30-second intervals)
- **Search & Filter** - Quickly find workflows and filter by provider

## The Problem It Solves

Managing LLM configurations across multiple n8n workflows can be tedious:
- Each workflow needs to be opened individually to check or change models
- No central view of which models are being used where
- Switching between models requires navigating through n8n's interface
- Hard to track Primary vs Fallback LLM setups

This dashboard solves all of that by providing a single interface to view and manage all your LLM configurations.

## Supported Node Types

| Node Type | Detection | Model Editing |
|-----------|-----------|---------------|
| AI Agent + LLM Chat Model | ✅ | ✅ |
| Basic LLM Chain | ✅ | ✅ |
| Native Gemini (Image Analysis) | ✅ | ✅ |
| Ollama Chat Model | ✅ | ✅ |
| OpenRouter Chat Model | ✅ | ✅ |
| Mistral AI Chat Model | ✅ | ✅ |

## Prerequisites

- Node.js 16+ installed
- n8n instance (self-hosted or cloud)
- n8n API Key (generated in n8n Settings > API)

## Installation

### Option 1: Clone from GitHub

```bash
# Clone the repository
git clone https://github.com/ghubtcs11/n8n-llm-dashboard.git

# Navigate to the directory
cd n8n-llm-dashboard

# Install dependencies
npm install

# Start the server
npm start
```

### Option 2: Download ZIP

1. Download the ZIP file from GitHub
2. Extract to your desired location
3. Open terminal in the extracted folder
4. Run `npm install`
5. Run `npm start`

## Configuration

1. Open your browser and go to `http://localhost:3100`
2. Click the ⚙️ (gear) icon in the top right
3. Enter your n8n details:
   - **n8n Base URL**: Your n8n instance URL (e.g., `https://your-n8n.com`)
   - **n8n API Key**: Your API key from n8n Settings > API
4. Click "Connect & Save"

## Usage

### Viewing Your Workflows

Once connected, the dashboard will display all active workflows containing AI agents:

- **Workflow Name** - The name of your n8n workflow
- **Agent Node** - The name of the AI Agent or LLM node
- **LLM Provider** - Which provider is being used (OpenAI, Gemini, etc.)
- **Model Version** - The current model selected
- **Actions** - Save button to update the model

### Changing Models

1. Click on the model dropdown for the agent you want to modify
2. Select a new model from the list, or choose "Custom model..." to enter a custom model name
3. Click "Save" to update the workflow in n8n
4. The change is applied immediately to your n8n workflow

### Using "Save All"

If you've made multiple changes:
1. Select all the models you want to change
2. Click "Save All" to update all changes at once

### Filtering

- Use the **Filter** buttons to show only specific providers
- Use the **Search** box to find workflows by name

### Auto-refresh

- The dashboard auto-refreshes every 30 seconds
- Click the 🔄 indicator to pause/resume auto-refresh

## API Reference

The dashboard uses n8n's public API:

- `GET /api/v1/workflows` - Fetch all active workflows
- `GET /api/v1/workflows/:id` - Fetch a specific workflow
- `PUT /api/v1/workflows/:id` - Update a workflow

## Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **API**: n8n REST API
- **Icons**: Font Awesome

## Project Structure

```
n8n-llm-dashboard/
├── server.js           # Express backend server
├── package.json        # Node.js dependencies
├── public/
│   ├── index.html      # Main HTML file
│   ├── app.js          # Frontend JavaScript
│   └── style.css       # Styling
└── README.md           # This file
```

## Troubleshooting

### "Missing x-n8n-url or x-n8n-api-key header"
- Make sure you've entered your n8n URL and API key in settings
- Check that the URL doesn't have a trailing slash

### "Cannot connect to n8n server"
- Verify your n8n instance is running
- Check the URL is correct (include https:// or http://)
- Ensure your network allows connections to n8n

### Models not showing correctly
- Some custom models may not appear in the dropdown
- Use the "Custom model..." option to enter any model name manually

### Changes not saving
- Check your API key has write permissions
- Verify the workflow is active in n8n
- Try refreshing the page and attempting the save again

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this in your own projects.

## Author

Created by [ghubtcs11](https://github.com/ghubtcs11)

## Support

If you encounter any issues or have feature requests, please [open an issue](https://github.com/ghubtcs11/n8n-llm-dashboard/issues) on GitHub.

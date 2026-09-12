/* Add your own AI API key here (or in Settings — each user's key is saved
   on their own device and survives refresh).
   Option A (FREE): Google Gemini — get a free key at https://aistudio.google.com/apikey
   Option B: OpenRouter — https://openrouter.ai/keys
   Detection uses Gemini first; if neither key is set it falls back to the
   offline on-device model. Values are overridable from the app settings. */
var GEMINI_KEY = "";
var GEMINI_MODEL = "gemini-3.6-flash";
var OPENROUTER_KEY = "";
var OPENROUTER_MODEL = "openai/gpt-4o-mini";
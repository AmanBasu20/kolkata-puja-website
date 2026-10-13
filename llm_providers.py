"""
AI Provider integrations for Kolkata Pujo Parikrama:
- Google Gemini (generateContent API with function calling)
- Groq Cloud (OpenAI-compatible chat completions with function calling)
"""

import os
import re
import json
import logging
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

from mcp_client import AsyncMcpClient

logger = logging.getLogger("llm_providers")

CORE_TOOLS = {
    "search_pandals",
    "get_pandal_details",
    "get_pandal_crowding",
    "find_nearby_pandals",
    "find_nearby_pandals_by_name",
    "get_nearest_metro",
    "get_nearest_metro_by_pandal",
    "get_metro_station_crowding",
    "get_metro_puja_special_services",
    "plan_metro_journey",
    "plan_puja_trip",
    "plan_walking_puja_route",
    "plan_puja_route",
    "get_route_between_pandals",
    "get_planned_puja_routes",
    "recommend_puja_route",
    "get_routing_service_health",
    "search_restaurants",
    "find_nearby_restaurants",
    "find_nearby_restaurants_by_pandal",
    "get_restaurant_availability",
    "get_live_traffic",
    "get_puja_schedule",
    "get_latest_pandal_update",
    "get_nearby_pandal_official_pages",
}

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

def get_gemini_keys_pool() -> list[str]:
    """Retrieves all configured Gemini keys from GEMINI_API_KEYS or GEMINI_API_KEY (supports comma/newline separated list)."""
    raw = os.environ.get("GEMINI_API_KEYS", "") or os.environ.get("GEMINI_API_KEY", "")
    if not raw:
        return []
    return [k.strip() for k in re.split(r"[,;\n\r]+", raw) if k.strip()]

_gemini_key_rr_index = 0

def get_next_pool_gemini_key() -> str:
    """Round-robin retrieves next available Gemini key from pool."""
    global _gemini_key_rr_index
    keys = get_gemini_keys_pool()
    if not keys:
        return ""
    key = keys[_gemini_key_rr_index % len(keys)]
    _gemini_key_rr_index = (_gemini_key_rr_index + 1) % len(keys)
    return key


GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions"

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022")
ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1/messages"

SYSTEM_PROMPT = """You are the official assistant for Kolkata Pujo Parikrama, a warm, culturally rich guide for exploring Durga Puja pandals, routes, themes, live traffic, and Metro services in Kolkata.

Guidelines:
1. Grounding & Strict Theme Authenticity (NO INVENTED OR OUTDATED THEMES):
   - NEVER invent, guess, or hallucinate a theme for any pandal.
   - NEVER present past years' outdated themes (e.g., 2022, 2023, or 2024 concepts) as current year's themes.
   - For Traditional / Heritage / Bonedi Bari Pujas (e.g., Baghbazar Sarbojanin, Sovabazar Rajbari, Maddox Square, Simla Vyayam Samiti):
     Describe them accurately as timeless **Traditional / Sabeki (সাবেকি পুজো)**, celebrated for classical *Ekchala* Pratima (Daker Saaj), historic rituals, and community fairground legacy. These committees intentionally never adopt modern commercial themes.
   - For Contemporary Thematic Art Pujas (e.g., Suruchi Sangha, Sreebhumi, Tala Prattoy, Chetla Agrani):
     * ONLY state a specific theme name if explicitly confirmed by your tool data (`get_latest_pandal_update` or tool results).
     * If the current year's theme is not confirmed in tool data, DO NOT invent one. Instead, truthfully state their artistic reputation (e.g., "Famous for grand contemporary artistic installations and spectacular lighting") and clarify that this year's theme is best witnessed live on-site.
2. Tool Usage & Knowledge Synthesis:
   - Always use your available tools to check details. Never cite internal tools, schemas, or databases by name (do NOT say "my tool returned no results" or "in our database").
   - If a specific pandal requested by the user is not found in an individual tool lookup (e.g. Mudiali Club, Shib Mandir), ALWAYS provide its full guide using standard Kolkata geographical and cultural knowledge (Mudiali Club is by Southern Avenue / Rabindra Sarobar Lake, Shib Mandir is on Lake Temple Road near Rabindra Sarobar Metro). Never drop or refuse requested pandals!
   - STRICT PRIORITIZATION OVER PREVIOUS GPS:
     * If the current user prompt mentions specific pandals by name (e.g., Baghbazar Sarbojanin, Sovabazar Rajbari, Kumartuli Park, Simla Byayam Samity, Suruchi Sangha), you MUST FOCUS EXCLUSIVELY ON THOSE SPECIFIED PANDALS.
     * DO NOT override requested pandals with GPS location coordinates from earlier conversation turns! A previous GPS turn is only a history record; the user's explicit current instruction always takes 100% priority.
     * If the user asks to optimize, plan, or switch transport modes for specific pandals, provide the route ONLY for those exact pandals.
   - If the user provides GPS coordinates or nearby suggestions:
     * Call `find_nearby_pandals` if helpful, or synthesize directly from the nearby registered pandal details provided in the prompt.
     * If the coordinates are in the northern suburbs (e.g. Sodepur, Panihati, Barrackpore, Belgharia, Khardaha, Dum Dum), explain warmly that they are slightly north of the central Kolkata Puja circuit, and highlight the closest accessible North Kolkata Pujas (e.g., Noapara Udayan Sangha near Noapara Metro, Dum Dum Park Tarun Dal / Bharat Chakra near Belgachia, Baghbazar Sarbojanin near Shyambazar Metro, Tala Prattoy near Belgachia/Shyambazar).
     * NEVER claim that suburban Indian Railways stations (such as Bandel, Madhyamgram, Barrackpore, Naihati, Sealdah, Howrah station) are Kolkata Metro stations! The Kolkata Metro Blue Line runs from Dakshineswar / Baranagar / Noapara down to Kavi Subhash, and the Green Line connects Howrah Maidan to Sector V / Sealdah.
     * Metro Grounding Reference:
       - Tala Prattoy: North Kolkata, near Belgachia or Shyambazar Metro (NOT South Kolkata).
       - Sreebhumi Sporting Club: VIP Road / Lake Town, nearest Metro is Belgachia or Dum Dum (NOT South Kolkata).
       - Baghbazar Sarbojanin: North Kolkata, nearest Metro is Shyambazar (NOT Bandel).
       - Sovabazar Rajbari: North Kolkata, nearest Metro is Shobhabazar Sutanuti (NOT Bandel).
       - Simla Vyayam Samiti: North Kolkata, nearest Metro is Girish Park (NOT Bandel).
       - Maddox Square: South Kolkata / Ballygunge, nearest Metro is Netaji Bhavan or Jatin Das Park (NOT Madhyamgram).
       - Suruchi Sangha: South Kolkata / New Alipore, nearest Metro is Kalighat or Rabindra Sarobar (NOT Ballygunge).
       - Chetla Agrani: South Kolkata / Chetla, nearest Metro is Kalighat or Jatin Das Park.
       - Tridhara Sammilani: South Kolkata / Deshapriya Park, nearest Metro is Kalighat.
   - If the user asks for pandals near them but NO GPS coordinates or suggestions are present in the query, DO NOT ask them to provide coordinates. Immediately showcase the top famous must-visit pandals in South and North Kolkata while noting they can tap the 📍 location icon or share their neighborhood (e.g., Kalighat, Gariahat, Salt Lake).
3. Rich, User-Friendly Formatting (Context-Aware & Adaptable):
   - DO NOT EVER use Markdown tables (| Column 1 | Column 2 |) for pandal lists or itineraries. Tables break mobile displays.
   - For Cultural, Thematic, or Historical Questions about a specific pandal (e.g., "What is the history of Sovabazar?", "Tell me about Tala Prattoy theme"):
     * Answer naturally in engaging, culturally rich conversational paragraphs.
     * DO NOT force rigid bulleted templates or unsolicited 🚇 Nearest Metro bullets unless the user explicitly asked how to get there or travel!
   - For Routes, Itineraries, or Lists of Pandals:
     * Format each pandal as a distinct card using ### headings:
       ### [Number]. [Pandal Name]
       - 🚇 **Nearest Metro**: Station name & approximate walking time (include whenever planning routes or itineraries).
       - 🎨 **Theme & Heritage**: 1-2 descriptive sentences detailing the idol style, historical legacy, or artistic concept.
       - 👥 **Crowd & Best Time**: Peak crowd hours, ideal visiting time, or photography tips.
       - 🚶 **Next Stop Direction**: 1 practical sentence with transit/walking directions to the next stop (omit for the final stop).
     * LARGE CIRCUITS (6 or more pandals): Keep descriptions tight and crisp (1 concise sentence per bullet) so the entire multi-stop circuit finishes cleanly without hitting length limits.
   - Skip conversational pleasantries at the start (do NOT say "Sure, here is your itinerary..."). Jump straight into the helpful facts.
   - For walking tours and itineraries, provide an upfront Route Header:
     🚶 **Walking Route: ~1.8 km | 25-30 mins walk**
     *Sequence: Stop 1 ➔ Stop 2 ➔ Stop 3*
   - Practical Transit & Weather Advisory for Itineraries:
     * 🚇 **Metro Service Window**: Mention key operational hours (e.g., "Kolkata Metro Blue Line runs round-the-clock festival night specials until 4:00 AM on Saptami, Ashtami, and Navami; Green Line runs until ~3:59 AM").
     * 🌦️ **Weather & Attire Tip**: Provide sensible festive tips based on Kolkata's October climate.
    - CUSTOM STARTING POINT RULE (Start from X first):
      * If the user says they want to visit or start from a specific pandal, area, or station first (e.g., Start from Dum Dum Park first, Start from Baghbazar, Ami Dum Dum theke shuru korte chai), you MUST set that exact location as **Stop #1** and plan the route outward to the closest neighboring pandals in geographic order.
    - Tailor Transit Modes When Requested:
      * 🚇+🚶 **Metro + Walk (Combined)**: Recommend Metro for long hops across zones, specify entry/exit gates, and describe the short walking sequence between adjacent pandals.
      * 🚶 **Walking Only (হাঁটার পথ)**: Focus on narrow heritage alleys, pedestrian-only barricaded zones, pedestrian safety, and total steps/walking duration.
      * 🛺 **Toto (e-rickshaw) / Auto-rickshaw + Walk (টোটো / অটো ও হাঁটা)**: Ideal for connecting pandals across Dum Dum Park, Lake Town, Salt Lake blocks, Behala, Ultadanga, and Gariahat. Mention local auto-rickshaw / Toto stand hops up to Kolkata Police pedestrian barricades, followed by short walks.
      * 🚕 **Taxi / Car / Cab (ট্যাক্সি / গাড়ি / ক্যাব)**: Emphasize main arterial roads, Yellow Taxi / App Cab drop-off points outside police no-entry barricades, and live traffic warnings.
      * 🏍️ **Bike / Two-Wheeler (বাইক)**: Highlight bike bypass routes and designated Kolkata Police temporary two-wheeler parking spots near pandal perimeters.
   - Include a local food/snack tip along the route (e.g., traditional sweet or kachori shops) at the end.
    - STRICT ITINERARY CONTINUITY & PANDAL PRESERVATION RULE:
      * When the user asks to switch travel modes (e.g. Metro, Walking, Toto/Auto, Taxi/Car, Bike) or asks to optimize/customize an itinerary from the previous turn, you MUST KEEP THE EXACT SAME PANDALS previously discussed.
      * DO NOT substitute, replace, or invent completely different pandals in other neighborhoods unless the user explicitly requests a different area.
      * Simply adapt the transit guidance (nearest Metro stations, Toto/Auto connectors, walking minutes, parking, or driving routes) FOR THOSE EXACT SAME PANDALS.
   - Ensure every bullet starts on a brand-new line with -  so it renders as a distinct visual card row.
4. Language & Banglish (Bengali in English Script) Mastery:
   - Seamlessly understand Pure Bengali (বাংলা), English, and **Banglish** (Bengali written using English alphabets, e.g., Ami Dum Dum Park theke pujo dekhte chai kivabe jabo, Sreebhumi te bhir kemon, Baghbazar theke Kumartuli hete koto khon lagbe).
   - If the user writes in Bengali script (বাংলা), reply in Bengali script using matching labels (🚇 **নিকটবর্তী মেট্রো**, 🎨 **থিম ও ঐতিহ্য**, 👥 **ভিড় ও সেরা সময়**, 🚶 **পরবর্তী গন্তব্যে হাঁটার পথ**, 🌦️ **আবহাওয়া ও পোশাকের পরামর্শ**, 🍽️ **খাবার**).
   - If the user writes in English or Banglish (Roman script), reply clearly in accessible English (with warm Bengali festive phrases like *Shubho Sharodiya*) using the standard card labels (- 🚇 **Nearest Metro**, - 🎨 **Theme & Heritage**, - 👥 **Crowd & Best Time**, - 🚶 **Next Stop Direction**) so interactive UI cards and route maps render flawlessly.
5. Images, Photos & Visual Lookups (STRICT DATASET POLICY):
   - You MUST NEVER invent, guess, hallucinate, or provide any external stock image URLs (absolutely NO Unsplash, Wikimedia, Pexels, Imgur, or random web URLs).
   - When the user asks for photos, images, or visual updates of a pandal or idol (e.g., "image of Baghbazar Sarbojanin" or "show me photos of Sreebhumi"):
     * STEP 1: Call `get_latest_pandal_update(pandal_name=...)` to check for recent Facebook post photos (`verified_images`) and post link (`post_url`).
     * STEP 2: ALWAYS ALSO retrieve the pandal's verified official Facebook page: resolve its coordinates (using `search_pandals` or pandal details) and call `get_nearby_pandal_official_pages(latitude=..., longitude=...)` to fetch the verified `official_facebook_page` URL.
     * IF verified images exist in `verified_images`: Display those images as Markdown `![caption](image_url)` AND provide the verified Facebook page link so users can explore more.
     * IF NO direct images are currently stored in the dataset: State honestly and provide the verified Facebook link:
       "Currently, our verified dataset does not have direct photos stored for this pandal yet. However, you can view their official photos, idol glimpses, and announcements directly on their verified page:"
       - 📘 **Official Facebook Page**: [Visit Committee Page](url)
     * If the user asks a general question like "Do you have any Durga Puja images?" without specifying a pandal, do NOT invent an image. Prompt the user:
       "Our visual updates come directly from verified dataset records of specific Kolkata pandals. Please tell me which pandal you would like to see (e.g., Sreebhumi, Baghbazar, Kumartuli Park, or Suruchi Sangha), and I will check our verified dataset for recent photos and official Facebook links!"
6. Social Media & Facebook Pages (VERIFIED DATASET ONLY):
   - Whenever the user asks for a pandal's Facebook, social media, official announcements, or online page:
     * Look up the pandal's coordinates (via `search_pandals` or details) and call `get_nearby_pandal_official_pages(latitude=..., longitude=...)` to retrieve its verified Facebook URL (`official_facebook_page`).
     * Also call `get_latest_pandal_update(pandal_name=...)` to check for recent Facebook post links (`post_url`) and verified photos.
     * If a verified Facebook page URL or post URL exists in the dataset, display it prominently:
       - 📘 **Official Facebook Page**: [Visit Official Facebook](url)
     * If no verified Facebook page or post is available in the dataset for that pandal, state honestly:
       "No verified official Facebook page is currently recorded in our 2026 dataset for this pandal."
     * NEVER invent or guess a Facebook URL (never make up facebook.com/pandalname). Only output verified links returned by your tools!
7. Route Navigation: When recommending a tour, list pandals in an optimal geographic walking sequence. Do NOT waste tokens outputting raw Google Maps links—the web application automatically detects the pandals and renders an interactive route map with full multi-stop navigation.
8. Tone: Warm, respectful, informative, and culturally knowledgeable. Wish the user 'Shubho Sharodiya' (শুভ শারদীয়া) at the very end.
"""

def _clean_schema(schema: dict) -> dict:
    """Removes unsupported keywords from JSON schema for LLMs."""
    clean = dict(schema)
    clean.pop("$schema", None)
    clean.pop("title", None)
    return clean

def _compact_desc(desc: str) -> str:
    """Extracts first sentence/clause of description to keep tool schemas compact."""
    if not desc:
        return ""
    lines = [l.strip() for l in desc.splitlines() if l.strip()]
    if lines:
        first = lines[0]
        if "." in first:
            return first.split(".")[0].strip() + "."
        return first[:150].strip()
    return desc[:150].strip()

def _format_tool_result(result_text: str, max_chars: int = 5000) -> str:
    """Safely format tool response, preserving full JSON structures when possible."""
    if not result_text or len(result_text) <= max_chars:
        return result_text

    # If it contains multiple concatenated JSON objects (like search_pandals)
    import re
    blocks = re.findall(r'\{[^{}]+\}', result_text)
    if len(blocks) > 1:
        # Collect top pandals cleanly until limit is reached
        kept = []
        cur_len = 0
        for b in blocks:
            if cur_len + len(b) > max_chars:
                break
            kept.append(b)
            cur_len += len(b) + 1
        if kept:
            return "\n".join(kept) + f"\n\n[Note: Returned top {len(kept)} matching pandals out of {len(blocks)} found in dataset]"

    # Fallback to safe slice
    return result_text[:max_chars] + "\n...(remaining results truncated for brevity)"


async def call_gemini(
    message: str,
    history: list[dict],
    mcp_client: AsyncMcpClient,
    api_key: str | None = None,
    model: str | None = None,
) -> str:
    if api_key:
        candidate_keys = [api_key.strip()]
    else:
        keys_pool = get_gemini_keys_pool()
        if not keys_pool:
            raise ValueError("Gemini API key is missing. Please provide your Gemini API key in Key Settings or configure GEMINI_API_KEY / GEMINI_API_KEYS.")
        start_key = get_next_pool_gemini_key()
        candidate_keys = [start_key] + [k for k in keys_pool if k != start_key]
    
    selected_model = model or os.environ.get("GEMINI_MODEL") or GEMINI_MODEL

    # 1. Fetch MCP tools & format as Gemini function declarations
    mcp_tools = await mcp_client.get_tools()
    function_declarations = []
    for tool in mcp_tools:
        schema = _clean_schema(tool.get("inputSchema", {}))
        decl = {
            "name": tool["name"],
            "description": _compact_desc(tool.get("description", "")),
        }
        if schema.get("properties"):
            decl["parameters"] = schema
        function_declarations.append(decl)

    # 2. Build contents
    contents = []
    for turn in history:
        role = "model" if turn.get("role") in ("assistant", "model") else "user"
        contents.append({"role": role, "parts": [{"text": turn.get("content", "")}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    tools_payload = []
    if function_declarations:
        tools_payload = [{"functionDeclarations": function_declarations}]

    # 3. Multi-turn execution loop with key pool failover (capped at 4 rounds for fast responses)
    max_rounds = 4
    rounds = 0
    key_idx = 0
    active_key = candidate_keys[key_idx]

    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=20.0)) as client:
        while rounds < max_rounds:
            url = f"{GEMINI_BASE_URL}/{selected_model}:generateContent?key={active_key}"
            body = {
                "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "contents": contents,
                "generationConfig": {"maxOutputTokens": 4096, "temperature": 0.4},
            }
            # Provide tools up to round 2. In subsequent rounds, omit tools to force immediate synthesis of final answer
            if tools_payload and rounds < 2:
                body["tools"] = tools_payload

            # Comprehensive key rotation across all keys in pool on 429 rate-limit
            resp = None
            tried_keys = 0
            total_candidate_keys = len(candidate_keys)
            
            while tried_keys < total_candidate_keys:
                active_key = candidate_keys[key_idx]
                current_url = f"{GEMINI_BASE_URL}/{selected_model}:generateContent?key={active_key}"
                try:
                    resp = await client.post(current_url, json=body)
                except Exception as net_err:
                    logger.warning("Network error calling Gemini: %s. Retrying next key...", net_err)
                    key_idx = (key_idx + 1) % total_candidate_keys
                    tried_keys += 1
                    continue

                if resp.status_code == 200:
                    break

                if resp.status_code in (429, 401, 403):
                    logger.warning(
                        "Gemini key %d/%d returned status %d. Rotating to next key in pool...",
                        key_idx + 1, total_candidate_keys, resp.status_code
                    )
                    key_idx = (key_idx + 1) % total_candidate_keys
                    tried_keys += 1
                    continue

                if resp.status_code in (503, 500, 404):
                    # Model high demand / unavailable: cascade to fallback models on the active key
                    for alt_model in ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.7-flash"]:
                        if alt_model in current_url:
                            continue
                        fallback_url = f"{GEMINI_BASE_URL}/{alt_model}:generateContent?key={active_key}"
                        try:
                            fallback_resp = await client.post(fallback_url, json=body)
                            if fallback_resp.status_code == 200:
                                resp = fallback_resp
                                current_url = fallback_url
                                selected_model = alt_model
                                break
                        except Exception:
                            pass
                    if resp and resp.status_code == 200:
                        break
                    
                    key_idx = (key_idx + 1) % total_candidate_keys
                    tried_keys += 1
                    continue

                # Other HTTP status error
                break

            if resp is None or resp.status_code != 200:
                err_msg = resp.text if resp else "No response"
                try:
                    err_json = resp.json()
                    err_msg = err_json.get("error", {}).get("message", resp.text)
                except Exception:
                    pass
                raise RuntimeError(f"Gemini API error ({resp.status_code if resp else 'N/A'}): {err_msg}")


            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise RuntimeError("Gemini returned no candidates.")

            candidate = candidates[0]
            content = candidate.get("content", {})
            parts = content.get("parts", [])

            # Check for function calls
            function_calls = [p["functionCall"] for p in parts if "functionCall" in p]
            if not function_calls:
                # Return final text
                text_parts = [p.get("text", "") for p in parts if "text" in p and not p.get("thought", False)]
                return "".join(text_parts).strip()

            # Execute tool calls concurrently with asyncio.gather to minimize latency
            rounds += 1
            contents.append({"role": "model", "parts": parts})
            
            async def _run_fc(fc_item):
                fn_name = fc_item.get("name")
                fn_args = fc_item.get("args", {})
                logger.info("Executing MCP tool via Gemini: %s(%s)", fn_name, fn_args)
                try:
                    res_txt = await mcp_client.call_tool(fn_name, fn_args)
                except Exception as e:
                    logger.error("MCP tool %s error: %s", fn_name, e)
                    res_txt = f"Tool execution failed: {e}"
                return {
                    "functionResponse": {
                        "name": fn_name,
                        "response": {"result": res_txt}
                    }
                }

            response_parts = await asyncio.gather(*[_run_fc(fc) for fc in function_calls])
            contents.append({"role": "user", "parts": list(response_parts)})

        # Final synthesis fallback: if we looped through max rounds, ask model once more without tools to synthesize gathered data
        try:
            logger.info("Gemini reached round limit. Forcing final synthesis step...")
            synth_contents = list(contents)
            synth_contents.append({
                "role": "user",
                "parts": [{"text": "Based on all the pandal, route, metro, and crowd information retrieved above, synthesize the final complete, beautifully formatted route guide now. Present each pandal with its Metro, Theme, Crowd & Tips, and Walk Next details."}]
            })
            synth_body = {
                "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "contents": synth_contents,
                "generationConfig": {"maxOutputTokens": 2048, "temperature": 0.3},
            }
            for synth_key in [active_key] + [k for k in candidate_keys if k != active_key]:
                synth_url = f"{GEMINI_BASE_URL}/{selected_model}:generateContent?key={synth_key}"
                try:
                    synth_resp = await client.post(synth_url, json=synth_body)
                    if synth_resp.status_code == 200:
                        s_data = synth_resp.json()
                        s_cands = s_data.get("candidates", [])
                        if s_cands:
                            s_parts = s_cands[0].get("content", {}).get("parts", [])
                            s_text = "".join([p.get("text", "") for p in s_parts if "text" in p and not p.get("thought", False)]).strip()
                            if s_text:
                                return s_text
                    elif synth_resp.status_code in (429, 401, 403):
                        continue
                except Exception:
                    continue
        except Exception as e:
            logger.warning("Forced synthesis step failed: %s", e)

        return "I apologize, but I could not finish processing the route and pandal details within the maximum search steps."


async def call_groq(
    message: str,
    history: list[dict],
    mcp_client: AsyncMcpClient,
    api_key: str | None = None,
    model: str | None = None,
) -> str:
    if api_key:
        key = api_key.strip()
    else:
        key = (GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip()
    if not key:
        raise ValueError("Groq API key is missing. Please provide your Groq API key in Key Settings or configure GROQ_API_KEY.")
    
    selected_model = model or os.environ.get("GROQ_MODEL") or GROQ_MODEL
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    # 1. Fetch MCP tools & format as OpenAI/Groq tools (filter to CORE_TOOLS to avoid huge token prompts on Groq)
    mcp_tools = await mcp_client.get_tools()
    tools_payload = []
    for tool in mcp_tools:
        if tool.get("name") not in CORE_TOOLS:
            continue
        schema = _clean_schema(tool.get("inputSchema", {}))
        tool_entry = {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": _compact_desc(tool.get("description", "")),
            }
        }
        if schema.get("properties"):
            tool_entry["function"]["parameters"] = schema
        tools_payload.append(tool_entry)

    # 2. Build messages list
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in history:
        messages.append({
            "role": "assistant" if turn.get("role") in ("assistant", "model") else "user",
            "content": turn.get("content", ""),
        })
    messages.append({"role": "user", "content": message})

    # 3. Multi-turn execution loop
    max_rounds = 3
    rounds = 0
    tool_summaries = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0)) as client:
        while rounds < max_rounds:
            body = {
                "model": selected_model,
                "messages": messages,
                "temperature": 0.4,
                "max_tokens": 3500,
            }
            if tools_payload and rounds < 1:
                body["tools"] = tools_payload

            max_retries = 3
            resp = None
            for attempt in range(max_retries + 1):
                resp = await client.post(GROQ_BASE_URL, json=body, headers=headers)
                if resp.status_code == 200:
                    break
                if resp.status_code in (429, 503):
                    err_text = resp.text
                    wait_sec = (attempt + 1) * 2.0
                    match_s = re.search(r"try again in (\d+(?:\.\d+)?)s", err_text)
                    match_ms = re.search(r"try again in (\d+(?:\.\d+)?)ms", err_text)
                    if match_ms:
                        wait_sec = (float(match_ms.group(1)) / 1000.0) + 0.5
                    elif match_s:
                        wait_sec = float(match_s.group(1)) + 0.5

                    # If TPM/OTPM/TPD limit hit and wait is long or retries exhausted, cascade immediately to alternative model
                    if "tokens per minute" in err_text.lower() or "tpm" in err_text.lower() or "tokens per day" in err_text.lower() or "tpd" in err_text.lower() or "otpm" in err_text.lower() or attempt == max_retries:
                        for alt_model in ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]:
                            if alt_model == selected_model:
                                continue
                            logger.warning("Groq limit hit on %s. Cascading to %s...", selected_model, alt_model)
                            fallback_body = dict(body)
                            fallback_body["model"] = alt_model
                            fallback_resp = await client.post(GROQ_BASE_URL, json=fallback_body, headers=headers)
                            if fallback_resp.status_code == 200:
                                resp = fallback_resp
                                selected_model = alt_model
                                body["model"] = alt_model
                                break
                        if resp and resp.status_code == 200:
                            break

                    if attempt < max_retries:
                        logger.warning("Groq returned %d. Sleeping %.2fs...", resp.status_code, wait_sec)
                        await asyncio.sleep(min(wait_sec, 20.0))

            if resp is None or resp.status_code != 200:
                err_msg = resp.text if resp else "No response"
                try:
                    err_json = resp.json()
                    err_msg = err_json.get("error", {}).get("message", resp.text)
                except Exception:
                    pass
                raise RuntimeError(f"Groq API error ({resp.status_code if resp else 'N/A'}): {err_msg}")

            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                raise RuntimeError("Groq returned no choices.")

            msg = choices[0].get("message", {})
            tool_calls = msg.get("tool_calls", [])
            content_text = msg.get("content", "") or ""

            # Check if model output text-based pseudo function calls like <function=name>args</function> or <parameter=k>v</parameter>
            if not tool_calls and "<function=" in content_text:
                matches = re.findall(r"<function=(\w+)>(.*?)(?:</function>|$)", content_text, re.DOTALL)
                for idx, (p_name, p_raw_arg) in enumerate(matches):
                    p_name = p_name.strip()
                    p_raw_arg = p_raw_arg.strip()
                    p_args = {}
                    # Check for <parameter=key>value</parameter> tags
                    param_tags = re.findall(r"<parameter=(\w+)>\s*(.*?)\s*</parameter>", p_raw_arg, re.DOTALL)
                    if param_tags:
                        for pk, pv in param_tags:
                            p_args[pk.strip()] = pv.strip().strip("\"'")
                    elif p_raw_arg:
                        try:
                            p_args = json.loads(p_raw_arg)
                        except Exception:
                            if ":" in p_raw_arg:
                                for line in p_raw_arg.splitlines():
                                    if ":" in line:
                                        k, v = line.split(":", 1)
                                        p_args[k.strip()] = v.strip().strip("\"'")
                            else:
                                p_args = {"query": p_raw_arg, "pandal_id": p_raw_arg}

                    logger.info("Detected inline pseudo tool call from Groq: %s(%s)", p_name, p_args)
                    tool_calls.append({
                        "id": f"call_{rounds}_{idx}_{p_name}",
                        "type": "function",
                        "function": {
                            "name": p_name,
                            "arguments": json.dumps(p_args)
                        }
                    })

            if not tool_calls:
                # Strip any leftover pseudo tool tags if present in final text
                cleaned = re.sub(r"<tool_call>.*?</tool_call>", "", content_text, flags=re.DOTALL)
                cleaned = re.sub(r"<function=\w+>.*?(?:</function>|$)", "", cleaned, flags=re.DOTALL)
                cleaned = re.sub(r"<parameter=\w+>.*?</parameter>", "", cleaned, flags=re.DOTALL)
                cleaned = cleaned.strip()
                if cleaned:
                    return cleaned
                # If text was just XML tool tags, fall through to forced synthesis
                break

            # Append assistant message with tool calls
            rounds += 1
            if msg.get("tool_calls"):
                messages.append(msg)
            else:
                messages.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": tool_calls
                })

            for tc in tool_calls:
                t_id = tc.get("id")
                fn = tc.get("function", {})
                fname = fn.get("name")
                raw_args = fn.get("arguments", "{}")
                try:
                    fargs = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except Exception:
                    fargs = {}

                logger.info("Executing MCP tool via Groq: %s(%s)", fname, fargs)
                try:
                    result_text = await mcp_client.call_tool(fname, fargs)
                except Exception as e:
                    logger.error("MCP tool %s error: %s", fname, e)
                    result_text = f"Tool execution failed: {e}"

                formatted_result = _format_tool_result(result_text, max_chars=4500)
                tool_summaries.append(f"{fname}: {formatted_result[:600]}")

                messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "content": formatted_result,
                })

        # Forced synthesis step
        try:
            logger.info("Groq reached round limit. Forcing final synthesis step...")
            synth_messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": message}
            ]
            if tool_summaries:
                summary_text = "\n\n".join(tool_summaries)
                synth_messages.append({
                    "role": "user",
                    "content": f"Here is the retrieved Puja data:\n{summary_text}\n\nNow synthesize the final complete, beautifully formatted route guide. Include every pandal requested with its Metro, Theme & Heritage, Crowd & Best Time, and Walk Next details, and food stops at the end."
                })
            else:
                synth_messages.append({
                    "role": "user",
                    "content": "Now synthesize the final complete, beautifully formatted route guide. Include every pandal requested with its Metro, Theme & Heritage, Crowd & Best Time, and Walk Next details, and food stops at the end."
                })

            synth_body = {
                "model": selected_model,
                "messages": synth_messages,
                "temperature": 0.3,
                "max_tokens": 3500,
            }

            synth_resp = await client.post(GROQ_BASE_URL, json=synth_body, headers=headers)
            if synth_resp.status_code == 200:
                s_choices = synth_resp.json().get("choices", [])
                if s_choices:
                    s_txt = s_choices[0].get("message", {}).get("content", "") or ""
                    cleaned = re.sub(r"<tool_call>.*?</tool_call>", "", s_txt, flags=re.DOTALL)
                    cleaned = re.sub(r"<function=\w+>.*?(?:</function>|$)", "", cleaned, flags=re.DOTALL)
                    cleaned = re.sub(r"<parameter=\w+>.*?</parameter>", "", cleaned, flags=re.DOTALL)
                    cleaned = cleaned.strip()
                    if cleaned:
                        return cleaned
            else:
                logger.warning("Groq synthesis call returned status %s: %s", synth_resp.status_code, synth_resp.text[:200])
        except Exception as e:
            logger.warning("Groq forced synthesis step failed: %s", e)

        return "I apologize, but I could not finish processing the route and pandal details within the maximum search steps."


async def call_openai(
    message: str,
    history: list[dict],
    mcp_client: AsyncMcpClient,
    api_key: str | None = None,
    model: str | None = None,
) -> str:
    if api_key:
        key = api_key.strip()
    else:
        key = (OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY", "")).strip()
    if not key:
        raise ValueError("OpenAI API key is missing. Please provide your OpenAI API key in the Custom Key settings.")
    
    selected_model = model or os.environ.get("OPENAI_MODEL") or OPENAI_MODEL
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    # 1. Fetch MCP tools & format as OpenAI tools
    mcp_tools = await mcp_client.get_tools()
    tools_payload = []
    for tool in mcp_tools:
        schema = _clean_schema(tool.get("inputSchema", {}))
        tool_entry = {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": _compact_desc(tool.get("description", "")),
            }
        }
        if schema.get("properties"):
            tool_entry["function"]["parameters"] = schema
        tools_payload.append(tool_entry)

    # 2. Build messages list
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in history:
        messages.append({
            "role": "assistant" if turn.get("role") in ("assistant", "model") else "user",
            "content": turn.get("content", ""),
        })
    messages.append({"role": "user", "content": message})

    # 3. Multi-turn execution loop
    max_rounds = 6
    rounds = 0
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=20.0)) as client:
        while rounds < max_rounds:
            body = {
                "model": selected_model,
                "messages": messages,
                "temperature": 0.4,
                "max_tokens": 4096,
            }
            if tools_payload and rounds < 4:
                body["tools"] = tools_payload

            resp = await client.post(OPENAI_BASE_URL, json=body, headers=headers)
            if resp.status_code != 200:
                err_msg = resp.text
                try:
                    err_msg = resp.json().get("error", {}).get("message", resp.text)
                except Exception:
                    pass
                raise RuntimeError(f"OpenAI API error ({resp.status_code}): {err_msg}")

            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                raise RuntimeError("OpenAI returned no choices.")

            msg = choices[0].get("message", {})
            tool_calls = msg.get("tool_calls", [])
            if not tool_calls:
                return msg.get("content", "").strip()

            rounds += 1
            messages.append(msg)

            for tc in tool_calls:
                t_id = tc.get("id")
                fn = tc.get("function", {})
                fname = fn.get("name")
                raw_args = fn.get("arguments", "{}")
                try:
                    fargs = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except Exception:
                    fargs = {}

                logger.info("Executing MCP tool via OpenAI: %s(%s)", fname, fargs)
                try:
                    result_text = await mcp_client.call_tool(fname, fargs)
                except Exception as e:
                    logger.error("MCP tool %s error: %s", fname, e)
                    result_text = f"Tool execution failed: {e}"

                formatted_result = _format_tool_result(result_text, max_chars=4500)
                messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "content": formatted_result,
                })

        # Final synthesis fallback for OpenAI
        try:
            logger.info("OpenAI reached round limit. Forcing final synthesis step...")
            synth_messages = list(messages)
            synth_messages.append({
                "role": "user",
                "content": "Based on all the pandal, route, metro, and crowd information retrieved above, synthesize the final complete, beautifully formatted route guide now. Present each pandal with its Metro, Theme, Crowd & Tips, and Walk Next details."
            })
            synth_body = {
                "model": selected_model,
                "messages": synth_messages,
                "temperature": 0.3,
                "max_tokens": 2048,
            }
            if tools_payload:
                synth_body["tools"] = tools_payload

            synth_resp = await client.post(OPENAI_BASE_URL, json=synth_body, headers=headers)
            if synth_resp.status_code == 200:
                s_choices = synth_resp.json().get("choices", [])
                if s_choices:
                    s_txt = s_choices[0].get("message", {}).get("content", "").strip()
                    if s_txt:
                        return s_txt
        except Exception as e:
            logger.warning("OpenAI forced synthesis step failed: %s", e)

        return "I apologize, but I could not finish processing the route within the maximum search steps."


async def call_anthropic(
    message: str,
    history: list[dict],
    mcp_client: AsyncMcpClient,
    api_key: str | None = None,
    model: str | None = None,
) -> str:
    if api_key:
        key = api_key.strip()
    else:
        key = (ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY", "")).strip()
    if not key:
        raise ValueError("Anthropic API key is missing. Please provide your Claude API key in the Custom Key settings.")
    
    selected_model = model or os.environ.get("ANTHROPIC_MODEL") or ANTHROPIC_MODEL
    headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }

    # 1. Fetch MCP tools & format as Anthropic tools
    mcp_tools = await mcp_client.get_tools()
    tools_payload = []
    for tool in mcp_tools:
        schema = _clean_schema(tool.get("inputSchema", {}))
        tool_entry = {
            "name": tool["name"],
            "description": _compact_desc(tool.get("description", "")),
            "input_schema": schema if schema.get("properties") else {"type": "object", "properties": {}},
        }
        tools_payload.append(tool_entry)

    # 2. Build messages
    messages = []
    for turn in history:
        role = "assistant" if turn.get("role") in ("assistant", "model") else "user"
        messages.append({"role": role, "content": turn.get("content", "")})
    messages.append({"role": "user", "content": message})

    # 3. Multi-turn loop
    max_rounds = 6
    rounds = 0
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=20.0)) as client:
        while rounds < max_rounds:
            body = {
                "model": selected_model,
                "system": SYSTEM_PROMPT,
                "messages": messages,
                "max_tokens": 4096,
            }
            if tools_payload and rounds < 4:
                body["tools"] = tools_payload

            resp = await client.post(ANTHROPIC_BASE_URL, json=body, headers=headers)
            if resp.status_code != 200:
                err_msg = resp.text
                try:
                    err_msg = resp.json().get("error", {}).get("message", resp.text)
                except Exception:
                    pass
                raise RuntimeError(f"Anthropic Claude API error ({resp.status_code}): {err_msg}")

            data = resp.json()
            content_blocks = data.get("content", [])
            tool_use_blocks = [b for b in content_blocks if b.get("type") == "tool_use"]

            if not tool_use_blocks:
                text_blocks = [b.get("text", "") for b in content_blocks if b.get("type") == "text"]
                return "".join(text_blocks).strip()

            rounds += 1
            messages.append({"role": "assistant", "content": content_blocks})

            tool_responses = []
            for tub in tool_use_blocks:
                t_id = tub.get("id")
                fname = tub.get("name")
                fargs = tub.get("input", {})

                logger.info("Executing MCP tool via Anthropic Claude: %s(%s)", fname, fargs)
                try:
                    result_text = await mcp_client.call_tool(fname, fargs)
                except Exception as e:
                    logger.error("MCP tool %s error: %s", fname, e)
                    result_text = f"Tool execution failed: {e}"

                formatted_result = _format_tool_result(result_text, max_chars=4500)
                tool_responses.append({
                    "type": "tool_result",
                    "tool_use_id": t_id,
                    "content": formatted_result,
                })

            messages.append({"role": "user", "content": tool_responses})

        # Final synthesis fallback for Anthropic Claude
        try:
            logger.info("Claude reached round limit. Forcing final synthesis step...")
            synth_messages = list(messages)
            synth_messages.append({
                "role": "user",
                "content": "Based on all the pandal, route, metro, and crowd information retrieved above, synthesize the final complete, beautifully formatted route guide now. Present each pandal with its Metro, Theme, Crowd & Tips, and Walk Next details."
            })
            synth_body = {
                "model": selected_model,
                "system": SYSTEM_PROMPT,
                "messages": synth_messages,
                "max_tokens": 2048,
            }
            synth_resp = await client.post(ANTHROPIC_BASE_URL, json=synth_body, headers=headers)
            if synth_resp.status_code == 200:
                s_blocks = synth_resp.json().get("content", [])
                s_txt = "".join([b.get("text", "") for b in s_blocks if b.get("type") == "text"]).strip()
                if s_txt:
                    return s_txt
        except Exception as e:
            logger.warning("Anthropic forced synthesis step failed: %s", e)

        return "I apologize, but I could not finish processing the route within the maximum search steps."


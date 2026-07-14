import os
import asyncio
import edge_tts

# Using commas and ellipses instead of periods to prevent the robotic pitch drop at the end.
preview_text = (
    "فاراماس، النظام الذكي الذي يدير صيدليتك بالكامل، من شاشة واحدة... "
    "نقطة بيع سريعة، مسح باركود فوري، وفواتير إلكترونية... "
    "مخزون ذكي، يتتبع كل صنف، ويُنبّهك قبل النفاد."
)

VOICES = {
    "Voice_6_Moaz_QA_Male": "ar-QA-MoazNeural",
    "Voice_7_Abdullah_OM_Male": "ar-OM-AbdullahNeural",
    "Voice_8_Fahed_KW_Male": "ar-KW-FahedNeural",
    "Voice_9_Zariyah_SA_Female": "ar-SA-ZariyahNeural",
    "Voice_10_Fatima_AE_Female": "ar-AE-FatimaNeural"
}

OUTPUT_DIR = "d:/Programming/Faramace/video_assets/Voice_Tests_New"

async def generate_audio():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    print("Generating 5 NEW voice previews...")
    for name, voice in VOICES.items():
        print(f"Generating {name}.mp3...")
        # Using rate=+2% and pitch=+2Hz to make it sound a bit more energetic and less robotic
        communicate = edge_tts.Communicate(preview_text, voice, rate="+2%", pitch="+2Hz")
        await communicate.save(os.path.join(OUTPUT_DIR, f"{name}.mp3"))
        
    print("Done! Check the Voice_Tests_New folder.")

if __name__ == '__main__':
    asyncio.run(generate_audio())

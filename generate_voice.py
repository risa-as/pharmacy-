import os
import asyncio
import edge_tts

# Define the script sections
lines = [
    ("part1_intro", "في عالم الصيدلة، كل ثانية تهم... كل وصفة تحتاج دقة... كل قرار يؤثر على حياة."),
    ("part2_dashboard", "فاراماس — النظام الذكي الذي يدير صيدليتك بالكامل من شاشة واحدة."),
    ("part3_pos", "نقطة بيع سريعة، مسح باركود فوري، وفواتير إلكترونية."),
    ("part4_inventory", "مخزون ذكي يتتبع كل صنف ويُنبّهك قبل النفاد."),
    ("part5_ai_scan", "وبقوة الذكاء الاصطناعي، حوّل أي وصفة طبية إلى أدوية جاهزة للصرف."),
    ("part6_outro", "فاراماس — مستقبل إدارة الصيدليات.")
]

# To avoid robotic drops at the end of sentences, we remove trailing periods or replace them with commas.
preview_text = (
    "في عالم الصيدلة، كل ثانية تهم، كل وصفة تحتاج دقة، كل قرار يؤثر على حياة. "
    "فاراماس، النظام الذكي الذي يدير صيدليتك بالكامل من شاشة واحدة. "
    "نقطة بيع سريعة، مسح باركود فوري وفواتير إلكترونية."
)

VOICES = {
    "Voice_1_Bassel_Iraqi": "ar-IQ-BasselNeural",
    "Voice_2_Rana_Iraqi_Female": "ar-IQ-RanaNeural",
    "Voice_3_Hamdan_Standard": "ar-AE-HamdanNeural",
    "Voice_4_Shakir_Standard": "ar-EG-ShakirNeural",
    "Voice_5_Hamed_Standard": "ar-SA-HamedNeural"
}

OUTPUT_DIR = "d:/Programming/Faramace/video_assets/Voice_Tests"

async def generate_audio():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    print("Generating 5 new voice previews...")
    for style, voice in VOICES.items():
        print(f"Generating {style}.mp3...")
        # Using normal rate, pitch=+5Hz can sometimes help reduce robotic drops at the end
        communicate = edge_tts.Communicate(preview_text, voice, rate="+0%", pitch="+0Hz")
        await communicate.save(os.path.join(OUTPUT_DIR, f"{style}.mp3"))
        
    print("Done! Check the Voice_Tests folder.")

if __name__ == "__main__":
    asyncio.run(generate_audio())

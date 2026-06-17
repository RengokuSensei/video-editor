import sys
import os
import bpy

def main():
    # Parse CLI arguments after --
    args = sys.argv
    output_path = "output.mp4"
    input_path = None
    
    if "--" in args:
        idx = args.index("--")
        for i in range(idx + 1, len(args)):
            if args[i] == "--output" and i + 1 < len(args):
                output_path = args[i+1]
            elif args[i] == "--input" and i + 1 < len(args):
                input_path = args[i+1]

    print(f"[Blender VSE Script] Render target output path: {output_path}")

    # Set up scene render context
    scene = bpy.context.scene
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.fps = 30

    # Ensure sequence editor exists
    if not scene.sequence_editor:
        scene.sequence_editor_create()

    seq = scene.sequence_editor
    
    # Clear existing strips
    for strip in list(seq.sequences):
        seq.sequences.remove(strip)

    # 1. Base background strip (Slate gray gradient base)
    color_strip = seq.sequences.new_effect(
        name="GradientBackground",
        type="COLOR",
        channel=1,
        frame_start=1,
        frame_end=150
    )
    color_strip.color = (0.15, 0.16, 0.18)
    scene.frame_start = 1
    scene.frame_end = 150

    # 2. If source video is specified, load it into channel 2
    if input_path and os.path.exists(input_path):
        print(f"[Blender VSE Script] Loading source video: {input_path}")
        try:
            movie_strip = seq.sequences.new_movie(
                name="SourceVideo",
                filepath=os.path.abspath(input_path),
                channel=2,
                frame_start=1
            )
            # Match project frames to input clip length
            scene.frame_end = movie_strip.frame_duration
            print(f"[Blender VSE Script] Loaded movie strip. Duration: {movie_strip.frame_duration} frames.")
        except Exception as e:
            print(f"[Blender VSE Script Error] Failed to load movie strip: {e}")

    # Set up render formatting settings (FFMPEG H264 MP4)
    scene.render.filepath = os.path.abspath(output_path)
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format = 'MPEG4'
    scene.render.ffmpeg.codec = 'H264'
    scene.render.ffmpeg.constant_rate_factor = 'MEDIUM'
    scene.render.ffmpeg.audio_codec = 'AAC'

    print("[Blender VSE Script] Launching animation render...")
    try:
        bpy.ops.render.render(animation=True)
        print("[Blender VSE Script] Render completed successfully!")
    except Exception as ex:
        print(f"[Blender VSE Script Error] Render failed: {ex}")

if __name__ == "__main__":
    main()

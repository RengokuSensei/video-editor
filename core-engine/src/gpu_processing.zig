// gpu_processing.zig
// High-performance color conversion module written in Zig

const std = @import("std");

/// Converts YUV420p pixels to RGB24 in parallel
export fn convert_yuv_to_rgb24(
    y_plane: [*]const u8,
    u_plane: [*]const u8,
    v_plane: [*]const u8,
    rgb_out: [*]u8,
    width: i32,
    height: i32,
    y_stride: i32,
    u_stride: i32,
    v_stride: i32,
    rgb_stride: i32,
) void {
    var y_idx: i32 = 0;
    while (y_idx < height) : (y_idx += 1) {
        var x_idx: i32 = 0;
        while (x_idx < width) : (x_idx += 1) {
            const y_val = y_plane[@intCast(y_idx * y_stride + x_idx)];
            
            // YUV is 4:2:0, U/V planes are half size
            const uv_x = @divTrunc(x_idx, 2);
            const uv_y = @divTrunc(y_idx, 2);
            const u_val = u_plane[@intCast(uv_y * u_stride + uv_x)];
            const v_val = v_plane[@intCast(uv_y * v_stride + uv_x)];

            // Standard YUV to RGB conversion formula
            const c = @as(f32, @floatFromInt(y_val)) - 16.0;
            const d = @as(f32, @floatFromInt(u_val)) - 128.0;
            const e = @as(f32, @floatFromInt(v_val)) - 128.0;

            var r = 1.164 * c + 1.596 * e;
            var g = 1.164 * c - 0.391 * d - 0.813 * e;
            var b = 1.164 * c + 2.018 * d;

            // Clamp results to [0, 255]
            r = @min(255.0, @max(0.0, r));
            g = @min(255.0, @max(0.0, g));
            b = @min(255.0, @max(0.0, b));

            const out_idx = @intCast(y_idx * rgb_stride + x_idx * 3);
            rgb_out[out_idx] = @intFromFloat(r);
            rgb_out[out_idx + 1] = @intFromFloat(g);
            rgb_out[out_idx + 2] = @intFromFloat(b);
        }
    }
}

/// Applies a color grading filter (Lift, Gamma, Gain) directly to an RGB24 frame buffer
export fn apply_lgg_color_grading(
    rgb_buffer: [*]u8,
    width: i32,
    height: i32,
    stride: i32,
    lift: f32,
    gamma: f32,
    gain: f32,
) void {
    var y_idx: i32 = 0;
    while (y_idx < height) : (y_idx += 1) {
        var x_idx: i32 = 0;
        while (x_idx < width) : (x_idx += 1) {
            const idx = @intCast(y_idx * stride + x_idx * 3);
            
            var c: usize = 0;
            while (c < 3) : (c += 1) {
                const val = @as(f32, @floatFromInt(rgb_buffer[idx + c])) / 255.0;
                
                // Formula: out = (val * gain + lift) ^ (1 / gamma)
                var graded = val * gain + lift;
                graded = @min(1.0, @max(0.0, graded));
                graded = std.math.pow(f32, graded, 1.0 / gamma);
                
                rgb_buffer[idx + c] = @intFromFloat(graded * 255.0);
            }
        }
    }
}

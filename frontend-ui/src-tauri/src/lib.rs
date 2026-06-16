use std::process::Command;
use std::fs::File;
use std::io::Write;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      open_file_dialog,
      import_to_timeline,
      handle_ai_generation,
      process_sketch_to_npu,
      process_video_ai,
      set_track_volume,
      set_track_mute_solo,
      split_clip,
      render_timeline_to_disk
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn decode_base64(data: &str) -> Result<Vec<u8>, String> {
  let table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let mut buffer = Vec::new();
  let mut char_count = 0;
  let mut chunk = 0;
  
  for c in data.chars() {
    if c.is_whitespace() || c == '=' {
      continue;
    }
    if let Some(val) = table.find(c) {
      chunk = (chunk << 6) | val;
      char_count += 1;
      if char_count == 4 {
        buffer.push((chunk >> 16) as u8);
        buffer.push((chunk >> 8) as u8);
        buffer.push(chunk as u8);
        chunk = 0;
        char_count = 0;
      }
    } else {
      return Err(format!("Invalid character in base64: {}", c));
    }
  }
  
  match char_count {
    2 => {
      buffer.push((chunk >> 4) as u8);
    }
    3 => {
      buffer.push((chunk >> 10) as u8);
      buffer.push((chunk >> 2) as u8);
    }
    _ => {}
  }
  
  Ok(buffer)
}

#[tauri::command]
async fn process_sketch_to_npu(
  app: tauri::AppHandle,
  sketch_data_url: Option<String>,
  prompt: Option<String>,
  strength: Option<f64>,
  base64_image: Option<String>,
  prompt_text: Option<String>,
) -> Result<String, String> {
  #[cfg(target_os = "android")]
  {
    return Ok("/sdcard/Pictures/npu_simulated.png".to_string());
  }

  #[cfg(not(target_os = "android"))]
  {
    let final_sketch = sketch_data_url
      .or(base64_image)
      .ok_or_else(|| "Missing sketch image data (base64Image/sketchDataUrl)".to_string())?;
      
    let final_prompt = prompt
      .or(prompt_text)
      .ok_or_else(|| "Missing prompt text (promptText/prompt)".to_string())?;
      
    let final_strength = strength.unwrap_or(0.75);

    let base64_str = if let Some(comma_pos) = final_sketch.find(',') {
      &final_sketch[comma_pos + 1..]
    } else {
      &final_sketch
    };
    
    let decoded_bytes = decode_base64(base64_str)?;
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to generate timestamp: {}", e))?
        .as_millis();
        
    let temp_dir = std::env::temp_dir();
    let sketch_path = temp_dir.join(format!("sketch_{}.png", timestamp));
    let output_path = temp_dir.join(format!("npu_{}.png", timestamp));
    
    let sketch_path_str = sketch_path.to_string_lossy().into_owned();
    let output_path_str = output_path.to_string_lossy().into_owned();
    
    {
      let mut file = File::create(&sketch_path)
          .map_err(|e| format!("Failed to create temporary sketch file: {}", e))?;
      file.write_all(&decoded_bytes)
          .map_err(|e| format!("Failed to write temporary sketch file: {}", e))?;
    }
    
    let sidecar_path = get_sidecar_path(&app)?;
    
    let prompt_clone = final_prompt.clone();
    let sidecar_path_clone = sidecar_path.clone();
    let sketch_path_str_clone = sketch_path_str.clone();
    let output_path_str_clone = output_path_str.clone();
    
    let task_res = tokio::task::spawn_blocking(move || {
      Command::new(&sidecar_path_clone)
        .arg("--npu")
        .arg(&sketch_path_str_clone)
        .arg(&output_path_str_clone)
        .arg(&prompt_clone)
        .arg(final_strength.to_string())
        .output()
    }).await.map_err(|e| format!("Tokio join error: {}", e))?;
    
    let output = task_res.map_err(|e| format!("Failed to execute NPU sidecar process: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    
    let _ = std::fs::remove_file(&sketch_path);
    
    if output.status.success() {
      Ok(output_path_str)
    } else {
      let err_msg = if !stderr.is_empty() {
          stderr
      } else if !stdout.is_empty() {
          stdout
      } else {
          "Unknown error returned by NPU Sidecar".to_string()
      };
      Err(err_msg)
    }
  }
}

#[tauri::command]
#[allow(non_snake_case)]
async fn process_video_ai(
  app: tauri::AppHandle,
  video_path: Option<String>,
  videoPath: Option<String>,
  sketch_path: Option<String>,
  sketchPath: Option<String>,
  prompt: Option<String>,
  task_type: Option<String>,
  taskType: Option<String>,
  strength: Option<f64>,
) -> Result<String, String> {
  #[cfg(target_os = "android")]
  {
    return Ok("/sdcard/Movies/ai_video_simulated.mp4".to_string());
  }

  #[cfg(not(target_os = "android"))]
  {
    let final_video_path = video_path
      .or(videoPath)
      .ok_or_else(|| "Missing video_path/videoPath argument".to_string())?;
      
    let final_sketch_path = sketch_path
      .or(sketchPath)
      .ok_or_else(|| "Missing sketch_path/sketchPath argument".to_string())?;
      
    let final_prompt = prompt
      .ok_or_else(|| "Missing prompt argument".to_string())?;
      
    let final_task_type = task_type
      .or(taskType)
      .ok_or_else(|| "Missing task_type/taskType argument".to_string())?;
      
    let final_strength = strength.unwrap_or(0.75);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to generate timestamp: {}", e))?
        .as_millis();
        
    let temp_dir = std::env::temp_dir();
    let extension = std::path::Path::new(&final_video_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("mp4");
        
    let output_path = temp_dir.join(format!("ai_video_{}.{}", timestamp, extension));
    let output_path_str = output_path.to_string_lossy().into_owned();
    
    let sidecar_path = get_sidecar_path(&app)?;
    
    let video_path_clone = final_video_path.clone();
    let sketch_path_clone = final_sketch_path.clone();
    let output_path_str_clone = output_path_str.clone();
    let prompt_clone = final_prompt.clone();
    let task_type_clone = final_task_type.clone();
    let sidecar_path_clone = sidecar_path.clone();
    
    let task_res = tokio::task::spawn_blocking(move || {
      Command::new(&sidecar_path_clone)
        .arg("--ai-video")
        .arg(&video_path_clone)
        .arg(&sketch_path_clone)
        .arg(&output_path_str_clone)
        .arg(&prompt_clone)
        .arg(&task_type_clone)
        .arg(final_strength.to_string())
        .output()
    }).await.map_err(|e| format!("Tokio join error: {}", e))?;
    
    let output = task_res.map_err(|e| format!("Failed to execute AI Video sidecar process: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    
    if output.status.success() {
      Ok(output_path_str)
    } else {
      let err_msg = if !stderr.is_empty() {
          stderr
      } else if !stdout.is_empty() {
          stdout
      } else {
          "Unknown error returned by AI Video sidecar".to_string()
      };
      Err(format!("AI Video sidecar returned non-zero exit code ({}). Output: {}", 
                   output.status.code().unwrap_or(-1), err_msg))
    }
  }
}



#[tauri::command]
async fn handle_ai_generation(prompt: String) -> Result<String, String> {
  // Simulate NPU processing latency
  tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

  let trimmed = prompt.trim();
  if trimmed.is_empty() {
    return Err("Prompt cannot be empty.".to_string());
  }

  let lower = trimmed.to_lowercase();
  if lower.contains("error") || lower.contains("fail") {
    return Err(format!("AI Copilot failed to process request: '{}'", trimmed));
  }

  Ok(format!("AI model successfully completed task. Applied enhancements based on: '{}'", trimmed))
}

#[tauri::command]
fn open_file_dialog() -> Result<Option<String>, String> {
  #[cfg(target_os = "android")]
  {
    Ok(Some("/sdcard/Movies/sample.mp4".to_string()))
  }
  #[cfg(not(target_os = "android"))]
  {
    let file = rfd::FileDialog::new()
      .add_filter("Video Files", &["mp4", "avi", "mov", "mkv"])
      .pick_file();

    match file {
      Some(path) => Ok(Some(path.to_string_lossy().into_owned())),
      None => Ok(None),
    }
  }
}

#[tauri::command]
#[allow(non_snake_case)]
fn import_to_timeline(
  app: tauri::AppHandle,
  file_path: Option<String>,
  filePath: Option<String>,
  start_time: Option<i32>,
  startTime: Option<i32>,
  track_number: Option<i32>,
  trackNumber: Option<i32>,
) -> Result<String, String> {
  #[cfg(target_os = "android")]
  {
    return Ok("Imported media to timeline in-process".to_string());
  }

  #[cfg(not(target_os = "android"))]
  {
    let final_file_path = file_path
      .or(filePath)
      .ok_or_else(|| "Missing file_path/filePath argument".to_string())?;
      
    let final_start_time = start_time
      .or(startTime)
      .ok_or_else(|| "Missing start_time/startTime argument".to_string())?;
      
    let final_track_number = track_number
      .or(trackNumber)
      .ok_or_else(|| "Missing track_number/trackNumber argument".to_string())?;

    let sidecar_path = get_sidecar_path(&app)?;
    
    let output = Command::new(&sidecar_path)
      .arg(&final_file_path)
      .arg(final_start_time.to_string())
      .arg(final_track_number.to_string())
      .output()
      .map_err(|e| format!("Failed to execute C++ engine at '{}' with args ['{}', '{}', '{}']: {}", 
                           sidecar_path.display(), final_file_path, final_start_time, final_track_number, e))?;
      
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    
    if output.status.success() {
      Ok(stdout)
    } else {
      let err_msg = if !stderr.is_empty() {
          stderr
      } else if !stdout.is_empty() {
          stdout
      } else {
          "Unknown error returned by C++ Media Engine".to_string()
      };
      Err(format!("C++ Engine returned non-zero exit code ({}). Output: {}", 
                   output.status.code().unwrap_or(-1), err_msg))
    }
  }
}

#[tauri::command]
#[allow(non_snake_case)]
fn set_track_volume(
  app: tauri::AppHandle,
  track_index: Option<i32>,
  trackIndex: Option<i32>,
  gain: Option<f64>,
) -> Result<String, String> {
  #[cfg(target_os = "android")]
  {
    return Ok("Track volume updated in-process".to_string());
  }

  #[cfg(not(target_os = "android"))]
  {
    let final_track_index = track_index
      .or(trackIndex)
      .ok_or_else(|| "Missing track_index/trackIndex argument".to_string())?;
      
    let final_gain = gain
      .ok_or_else(|| "Missing gain argument".to_string())?;

    let sidecar_path = get_sidecar_path(&app)?;
    
    let output = Command::new(&sidecar_path)
      .arg("--set-track-volume")
      .arg(final_track_index.to_string())
      .arg(final_gain.to_string())
      .output()
      .map_err(|e| format!("Failed to execute sidecar: {}", e))?;
      
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    
    if output.status.success() {
      Ok(stdout)
    } else {
      let err_msg = if !stderr.is_empty() { stderr } else { stdout };
      Err(format!("Sidecar returned non-zero code. Error: {}", err_msg))
    }
  }
}

#[tauri::command]
#[allow(non_snake_case)]
fn set_track_mute_solo(
  app: tauri::AppHandle,
  track_index: Option<i32>,
  trackIndex: Option<i32>,
  mute: Option<bool>,
  solo: Option<bool>,
) -> Result<String, String> {
  #[cfg(target_os = "android")]
  {
    return Ok("Track mute/solo set in-process".to_string());
  }

  #[cfg(not(target_os = "android"))]
  {
    let final_track_index = track_index
      .or(trackIndex)
      .ok_or_else(|| "Missing track_index/trackIndex argument".to_string())?;
      
    let final_mute = mute.unwrap_or(false);
    let final_solo = solo.unwrap_or(false);

    let sidecar_path = get_sidecar_path(&app)?;
    
    let output = Command::new(&sidecar_path)
      .arg("--set-track-mute-solo")
      .arg(final_track_index.to_string())
      .arg(final_mute.to_string())
      .arg(final_solo.to_string())
      .output()
      .map_err(|e| format!("Failed to execute sidecar: {}", e))?;
      
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    
    if output.status.success() {
      Ok(stdout)
    } else {
      let err_msg = if !stderr.is_empty() { stderr } else { stdout };
      Err(format!("Sidecar returned non-zero code. Error: {}", err_msg))
    }
  }
}

#[tauri::command]
#[allow(non_snake_case)]
fn split_clip(
  app: tauri::AppHandle,
  track_index: Option<i32>,
  trackIndex: Option<i32>,
  clip_index: Option<i32>,
  clipIndex: Option<i32>,
  split_frame: Option<i32>,
  splitFrame: Option<i32>,
) -> Result<String, String> {
  #[cfg(target_os = "android")]
  {
    return Ok("Clip split in-process".to_string());
  }

  #[cfg(not(target_os = "android"))]
  {
    let final_track_index = track_index
      .or(trackIndex)
      .ok_or_else(|| "Missing track_index/trackIndex argument".to_string())?;
      
    let final_clip_index = clip_index
      .or(clipIndex)
      .ok_or_else(|| "Missing clip_index/clipIndex argument".to_string())?;
      
    let final_split_frame = split_frame
      .or(splitFrame)
      .ok_or_else(|| "Missing split_frame/splitFrame argument".to_string())?;

    let sidecar_path = get_sidecar_path(&app)?;
    
    let output = Command::new(&sidecar_path)
      .arg("--split-clip")
      .arg(final_track_index.to_string())
      .arg(final_clip_index.to_string())
      .arg(final_split_frame.to_string())
      .output()
      .map_err(|e| format!("Failed to execute sidecar: {}", e))?;
      
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    
    if output.status.success() {
      Ok(stdout)
    } else {
      let err_msg = if !stderr.is_empty() { stderr } else { stdout };
      Err(format!("Sidecar returned non-zero code. Error: {}", err_msg))
    }
  }
}

#[tauri::command]
#[allow(non_snake_case)]
fn render_timeline_to_disk(
  app: tauri::AppHandle,
  output_path: Option<String>,
  outputPath: Option<String>,
  encoder_params: Option<String>,
  encoderParams: Option<String>,
) -> Result<String, String> {
  #[cfg(target_os = "android")]
  {
    return Ok("Timeline rendered to /sdcard/Movies/output.mp4".to_string());
  }

  #[cfg(not(target_os = "android"))]
  {
    let final_output_path = output_path
      .or(outputPath)
      .ok_or_else(|| "Missing output_path/outputPath argument".to_string())?;
      
    let final_encoder_params = encoder_params
      .or(encoderParams)
      .unwrap_or_else(|| "acodec=aac vcodec=libx264".to_string());

    let sidecar_path = get_sidecar_path(&app)?;
    
    let output = Command::new(&sidecar_path)
      .arg("--render-timeline-to-disk")
      .arg(&final_output_path)
      .arg(&final_encoder_params)
      .output()
      .map_err(|e| format!("Failed to execute sidecar: {}", e))?;
      
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    
    if output.status.success() {
      Ok(stdout)
    } else {
      let err_msg = if !stderr.is_empty() { stderr } else { stdout };
      Err(format!("Sidecar returned non-zero code. Error: {}", err_msg))
    }
  }
}

fn get_sidecar_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
  let exe_dir = std::env::current_exe()
    .map_err(|e| format!("Failed to get current executable path: {}", e))?
    .parent()
    .ok_or_else(|| "Failed to get current executable directory".to_string())?
    .to_path_buf();
    
  let target_triple = "aarch64-pc-windows-msvc";
  let sidecar_with_triple = format!("VideoTimelineManager-{}.exe", target_triple);
  let sidecar_plain = "VideoTimelineManager.exe";
  
  let candidates = vec![
    // 1. Next to the current executable (dev target/debug/ or release build)
    exe_dir.join(&sidecar_plain),
    exe_dir.join(&sidecar_with_triple),
    
    // 2. In resources directory (bundled)
    match app.path().resource_dir() {
        Ok(dir) => dir.join("bin").join(&sidecar_plain),
        Err(_) => std::path::PathBuf::new(),
    },
    match app.path().resource_dir() {
        Ok(dir) => dir.join("bin").join(&sidecar_with_triple),
        Err(_) => std::path::PathBuf::new(),
    },
    match app.path().resource_dir() {
        Ok(dir) => dir.join(&sidecar_plain),
        Err(_) => std::path::PathBuf::new(),
    },
    match app.path().resource_dir() {
        Ok(dir) => dir.join(&sidecar_with_triple),
        Err(_) => std::path::PathBuf::new(),
    },
    
    // 3. Project source tree
    std::path::PathBuf::from("d:/k50i/video/frontend-ui/src-tauri/bin").join(&sidecar_with_triple),
    std::path::PathBuf::from("d:/k50i/video/frontend-ui/src-tauri/bin").join(&sidecar_plain),
    
    // 4. Fallback to C++ build directory
    std::path::PathBuf::from("d:/k50i/video/core-engine/build/Release/VideoTimelineManager.exe"),
  ];
  
  let mut checked_paths = Vec::new();
  for path in candidates {
    if path.as_os_str().is_empty() {
      continue;
    }
    let path_str = path.to_string_lossy().into_owned();
    if path.exists() {
      return Ok(path);
    }
    checked_paths.push(path_str);
  }
  
  Err(format!(
    "Could not find sidecar binary '{}' or '{}' in any candidate path. Checked locations: {:?}",
    sidecar_with_triple, sidecar_plain, checked_paths
  ))
}

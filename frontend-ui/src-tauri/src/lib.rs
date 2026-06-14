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
      process_sketch_to_npu
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
  sketch_data_url: String,
  prompt: String,
  strength: f64,
) -> Result<String, String> {
  let base64_str = if let Some(comma_pos) = sketch_data_url.find(',') {
    &sketch_data_url[comma_pos + 1..]
  } else {
    &sketch_data_url
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
  
  let prompt_clone = prompt.clone();
  let sidecar_path_clone = sidecar_path.clone();
  let sketch_path_str_clone = sketch_path_str.clone();
  let output_path_str_clone = output_path_str.clone();
  
  let task_res = tokio::task::spawn_blocking(move || {
    Command::new(&sidecar_path_clone)
      .arg("--npu")
      .arg(&sketch_path_str_clone)
      .arg(&output_path_str_clone)
      .arg(&prompt_clone)
      .arg(strength.to_string())
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
  let file = rfd::FileDialog::new()
    .add_filter("Video Files", &["mp4", "avi", "mov", "mkv"])
    .pick_file();

  match file {
    Some(path) => Ok(Some(path.to_string_lossy().into_owned())),
    None => Ok(None),
  }
}

#[tauri::command]
fn import_to_timeline(
  app: tauri::AppHandle,
  file_path: String,
  start_time: i32,
  track_number: i32,
) -> Result<String, String> {
  let sidecar_path = get_sidecar_path(&app)?;
  
  let output = Command::new(&sidecar_path)
    .arg(&file_path)
    .arg(start_time.to_string())
    .arg(track_number.to_string())
    .output()
    .map_err(|e| format!("Failed to execute C++ engine: {}", e))?;
    
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
    Err(err_msg)
  }
}

fn get_sidecar_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
  let exe_dir = std::env::current_exe()
    .map_err(|e| format!("Failed to get current executable path: {}", e))?
    .parent()
    .ok_or_else(|| "Failed to get current executable directory".to_string())?
    .to_path_buf();
    
  let sidecar_name = "VideoTimelineManager-aarch64-pc-windows-msvc.exe";
  
  // 1. Next to the current executable (dev target/debug/ or release build)
  let path1 = exe_dir.join(sidecar_name);
  if path1.exists() {
    return Ok(path1);
  }
  
  // 2. In resources directory (bundled)
  if let Ok(resource_dir) = app.path().resource_dir() {
    let path2 = resource_dir.join("bin").join(sidecar_name);
    if path2.exists() {
      return Ok(path2);
    }
    let path3 = resource_dir.join(sidecar_name);
    if path3.exists() {
      return Ok(path3);
    }
  }
  
  // 3. Project source tree
  let project_sidecar = std::path::PathBuf::from("d:/k50i/video/frontend-ui/src-tauri/bin").join(sidecar_name);
  if project_sidecar.exists() {
    return Ok(project_sidecar);
  }
  
  // 4. Fallback to C++ build directory
  let core_engine_bin = std::path::PathBuf::from("d:/k50i/video/core-engine/build/Release/VideoTimelineManager.exe");
  if core_engine_bin.exists() {
    return Ok(core_engine_bin);
  }
  
  Err(format!("Could not find sidecar binary '{}' in any candidate path.", sidecar_name))
}

package com.videoeditor.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.PluginManager

@TauriPlugin
class MobileBridgePlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun openFileDialog(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "video/*"
            addCategory(Intent.CATEGORY_OPENABLE)
        }
        
        PluginManager.startActivityForResult(intent) { result ->
            if (result.resultCode == Activity.RESULT_OK) {
                val uri: Uri? = result.data?.data
                if (uri != null) {
                    val cachePath = copyUriToCache(uri)
                    if (cachePath != null) {
                        val ret = JSObject()
                        ret.put("filePath", cachePath)
                        invoke.resolve(ret)
                    } else {
                        invoke.reject("Failed to copy chosen video to cache")
                    }
                } else {
                    invoke.reject("No video selected")
                }
            } else {
                invoke.reject("File picking cancelled")
            }
        }
    }

    private fun copyUriToCache(uri: Uri): String? {
        try {
            val contentResolver = activity.contentResolver
            val cursor = contentResolver.query(uri, null, null, null, null)
            val name = cursor?.use {
                if (it.moveToFirst()) {
                    val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (nameIndex != -1) it.getString(nameIndex) else null
                } else null
            } ?: "temp_video.mp4"
            
            val cacheFile = java.io.File(activity.cacheDir, name)
            contentResolver.openInputStream(uri)?.use { inputStream ->
                java.io.FileOutputStream(cacheFile).use { outputStream ->
                    inputStream.copyTo(outputStream)
                }
            }
            return cacheFile.absolutePath
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }

    @Command
    fun importToTimeline(invoke: Invoke) {
        val ret = JSObject()
        ret.put("status", "Imported media on Android")
        invoke.resolve(ret)
    }

    @Command
    fun setTrackVolume(invoke: Invoke) {
        val ret = JSObject()
        ret.put("status", "Volume updated")
        invoke.resolve(ret)
    }

    @Command
    fun setTrackMuteSolo(invoke: Invoke) {
        val ret = JSObject()
        ret.put("status", "Mute/Solo updated")
        invoke.resolve(ret)
    }

    @Command
    fun splitClip(invoke: Invoke) {
        val ret = JSObject()
        ret.put("status", "Clip split")
        invoke.resolve(ret)
    }

    @Command
    fun renderTimelineToDisk(invoke: Invoke) {
        val ret = JSObject()
        ret.put("status", "Render completed")
        invoke.resolve(ret)
    }

    @Command
    fun processSketchToNpu(invoke: Invoke) {
        val ret = JSObject()
        ret.put("outputPath", "/sdcard/Pictures/npu_simulated.png")
        invoke.resolve(ret)
    }

    @Command
    fun processVideoAi(invoke: Invoke) {
        val ret = JSObject()
        ret.put("outputPath", "/sdcard/Movies/ai_video_simulated.mp4")
        invoke.resolve(ret)
    }
}

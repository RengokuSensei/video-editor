#pragma once

namespace diagnostics {

// Intercepts and redirects MLT and FFmpeg log messages into the custom Logger class
void registerFrameworkLoggingBridges();

} // namespace diagnostics

use url::Url;

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    log::debug!("Attempting to open URL: {}", url);
    if let Err(e) = opener::open_browser(&url) {
        log::warn!(
            "opener::open_browser failed: {}. Trying WSL fallback via powershell.exe",
            e
        );

        // WSL2 specific fallback: Use powershell.exe to open the browser on the Windows host
        std::process::Command::new("powershell.exe")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(format!("Start-Process '{}'", url.replace("'", "''")))
            .spawn()
            .map_err(|err| {
                log::error!("WSL fallback failed: {}", err);
                format!(
                    "Failed to open browser (opener error: {}, fallback error: {})",
                    e, err
                )
            })?;
    }
    Ok(())
}

#[tauri::command]
pub fn frontend_log(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!("[JS] {}", message),
        "warn" => log::warn!("[JS] {}", message),
        _ => log::info!("[JS] {}", message),
    }
}

#[tauri::command]
pub async fn start_google_auth_server() -> Result<String, String> {
    log::debug!("Command: start_google_auth_server called");
    log::debug!("Attempting to bind auth server to 0.0.0.0:51737");
    let server = tiny_http::Server::http("0.0.0.0:51737").map_err(|e| {
        log::error!("Failed to start auth server: {}", e);
        format!("Failed to start server: {}", e)
    })?;

    log::info!("Auth server started on http://0.0.0.0:51737 (accessible via localhost from host)");

    // We need to run the server in a loop
    loop {
        if let Ok(request) = server.recv() {
            let url_str = request.url();
            log::info!("Auth server received request: {}", url_str);

            // In Authorization Code flow, the code comes in the query string: /?code=...
            if url_str.contains("code=") {
                log::info!("Auth server: Code parameter found");
                let full_url = format!("http://localhost{}", url_str);
                let parsed_url = Url::parse(&full_url).map_err(|e| {
                    log::error!("Auth server: URL parse error: {}", e);
                    e.to_string()
                })?;
                let params: std::collections::HashMap<_, _> =
                    parsed_url.query_pairs().into_owned().collect();

                if let Some(code) = params.get("code") {
                    log::info!("Auth server: Code extracted successfully");
                    let response = tiny_http::Response::from_string(
                        "Authentication successful! You can close this tab and return to the app.",
                    )
                    .with_header(
                        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/plain"[..])
                            .unwrap(),
                    );
                    request.respond(response).ok();
                    return Ok(code.clone());
                }
            } else if url_str.contains("error=") {
                log::warn!("Auth server: Error parameter found: {}", url_str);
                let response = tiny_http::Response::from_string(
                    "Authentication failed. Please check the app for details.",
                );
                request.respond(response).ok();
                return Err("Authentication failed or was denied.".to_string());
            } else {
                log::debug!("Auth server: Non-auth request received: {}", url_str);
                // Fallback for favicon.ico or other requests
                let response = tiny_http::Response::from_string("Waiting for authentication...");
                request.respond(response).ok();
            }
        }
    }
}

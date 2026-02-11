use url::Url;

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    opener::open_browser(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_google_auth_server() -> Result<String, String> {
    log::info!("Command: start_google_auth_server called");
    // Use port 51737 to avoid conflict with dev server (1420)
    let server = tiny_http::Server::http("127.0.0.1:51737")
        .map_err(|e| format!("Failed to start server: {}", e))?;

    log::info!("Auth server started on http://127.0.0.1:51737");

    // We need to run the server in a loop
    loop {
        if let Ok(request) = server.recv() {
            let url = request.url();
            log::info!("Auth server received request: {}", url);

            // In Authorization Code flow, the code comes in the query string: /?code=...
            if url.contains("code=") {
                let full_url = format!("http://localhost{}", url);
                let parsed_url = Url::parse(&full_url).map_err(|e| e.to_string())?;
                let params: std::collections::HashMap<_, _> =
                    parsed_url.query_pairs().into_owned().collect();

                if let Some(code) = params.get("code") {
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
            } else if url.contains("error=") {
                let response = tiny_http::Response::from_string(
                    "Authentication failed. Please check the app for details.",
                );
                request.respond(response).ok();
                return Err("Authentication failed or was denied.".to_string());
            } else {
                // Fallback for favicon.ico or other requests
                let response = tiny_http::Response::from_string("Waiting for authentication...");
                request.respond(response).ok();
            }
        }
    }
}

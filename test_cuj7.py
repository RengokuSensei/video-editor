import time
from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto("http://localhost:5173")
    page.wait_for_timeout(2000)

    add_local_file_js = """
    (() => {
        window.__TAURI_INTERNALS__ = {
            invoke: async (cmd, args) => {
                if (cmd === "open_file_dialog") {
                    return "C:\\\\Users\\\\Test\\\\Videos\\\\MyLocalVideo.mp4";
                }
                if (cmd === "import_to_timeline") {
                    return "SUCCESS";
                }
                return null;
            }
        };
    })();
    """
    page.evaluate(add_local_file_js)

    page.get_by_role("button", name="Import Local").click()
    page.wait_for_timeout(1000)

    simulate_drag_drop_js = """
    (() => {
        const localFileCards = document.querySelectorAll('div[draggable="true"]');
        if (localFileCards.length > 0) {
            const card = localFileCards[localFileCards.length - 1]; // get the local video
            const timeline = document.querySelector('[class*="scrollContainer"]');

            if (timeline) {
                const dt = new DataTransfer();

                // Trigger dragstart on card
                const reactHandlerKey = Object.keys(card).find(k => k.startsWith('__reactProps$'));
                if (reactHandlerKey && card[reactHandlerKey].onDragStart) {
                    card[reactHandlerKey].onDragStart({
                        preventDefault: () => {},
                        stopPropagation: () => {},
                        dataTransfer: dt,
                    });
                }

                // Trigger drop on timeline
                const timelineHandlerKey = Object.keys(timeline).find(k => k.startsWith('__reactProps$'));
                if (timelineHandlerKey && timeline[timelineHandlerKey].onDrop) {
                    timeline[timelineHandlerKey].onDrop({
                        preventDefault: () => {},
                        stopPropagation: () => {},
                        currentTarget: timeline,
                        clientX: 300,
                        clientY: 500,
                        dataTransfer: dt
                    });
                }
            }
        }
    })();
    """
    page.evaluate(simulate_drag_drop_js)
    page.wait_for_timeout(2000)

    page.screenshot(path="/home/jules/verification/screenshots/verification6.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(record_video_dir="/home/jules/verification/videos4")
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()

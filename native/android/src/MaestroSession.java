package __PACKAGE_NAME__;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.HardwareBuffer;
import android.os.Build;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.app.assist.AssistStructure;
import android.app.assist.AssistStructure.ViewNode;
import android.app.assist.AssistStructure.WindowNode;
import android.util.Log;

public class MaestroSession extends VoiceInteractionSession {

    private static final String TAG = "MaestroSession";

    private boolean activityStarted = false;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable startOverlayRunnable = new Runnable() {
        @Override
        public void run() {
            startOverlayActivity();
        }
    };

    public MaestroSession(Context context) { 
        super(context); 
    }

    @Override
    public void onHandleScreenshot(Bitmap screenshot) {
        if (screenshot != null) {
            try {
                Log.i(TAG, "onHandleScreenshot: got " + screenshot.getWidth() + "x" + screenshot.getHeight()
                        + " config=" + screenshot.getConfig());
                //session recycles bitmap keep owned copy
                Bitmap owned = screenshot.copy(Bitmap.Config.ARGB_8888, false);
                if (owned == null) {
                    Log.w(TAG, "onHandleScreenshot: copy failed, keeping the framework bitmap");
                    owned = screenshot;
                }
                ScreenshotHolder.set(owned);
            } catch (Throwable t) {
                Log.w(TAG, "onHandleScreenshot failed: " + t.getMessage());
            }
        } else {
            //system called with empty screenshot
            Log.w(TAG, "onHandleScreenshot called with a null screenshot");
        }
        //start activity with screenshot
        startOverlayActivity();
    }

    @Override
    public void onHandleAssist(Bundle data, AssistStructure structure, android.app.assist.AssistContent content) {
        super.onHandleAssist(data, structure, content);
        if (structure != null && structure.getActivityComponent() != null) {
            String pkg = structure.getActivityComponent().getPackageName();
            Log.d(TAG, "onHandleAssist: current package = " + pkg);
            ScreenshotHolder.setAppPackage(pkg);

            String screenText = flattenStructure(structure);
            ScreenshotHolder.setScreenText(screenText);
            Log.d(TAG, "onHandleAssist: extracted " + screenText.length() + " chars of screen text");
        } else {
            ScreenshotHolder.setAppPackage("Unknown");
            ScreenshotHolder.setScreenText(null);
        }
    }

    /**
     * recursively flatten the AssistStructure tree into a single string.
     * filters out invisible nodes and uses newline separators to preserve
     * reading order for downstream entity extraction.
     */
    private String flattenStructure(AssistStructure structure) {
        StringBuilder sb = new StringBuilder();
        int windowCount = structure.getWindowNodeCount();
        for (int i = 0; i < windowCount; i++) {
            WindowNode windowNode = structure.getWindowNodeAt(i);
            ViewNode rootView = windowNode.getRootViewNode();
            if (rootView != null) {
                //window origin anchors the subtree
                flattenViewNode(rootView, sb, windowNode.getLeft(), windowNode.getTop());
            }
        }
        return sb.toString().trim();
    }

    private void flattenViewNode(ViewNode node, StringBuilder sb, int originX, int originY) {
        //skip invisible nodes
        int visibility = node.getVisibility();
        if (visibility != android.view.View.VISIBLE) {
            return;
        }

        //offsets relative to the parent
        int left = originX + node.getLeft();
        int top = originY + node.getTop();

        CharSequence text = node.getText();
        if (text != null && text.length() > 0) {
            String trimmed = text.toString().trim();
            if (!trimmed.isEmpty()) {
                sb.append(trimmed).append("\n");
            }
        }

        //also check content description
        CharSequence contentDesc = node.getContentDescription();
        if (contentDesc != null && contentDesc.length() > 0) {
            String trimmed = contentDesc.toString().trim();
            if (!trimmed.isEmpty() && (text == null || !trimmed.equals(text.toString().trim()))) {
                sb.append(trimmed).append("\n");
            }
        }

        //children live in the scrolled box
        int childX = left - node.getScrollX();
        int childY = top - node.getScrollY();
        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            ViewNode child = node.getChildAt(i);
            if (child != null) {
                flattenViewNode(child, sb, childX, childY);
            }
        }
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        activityStarted = false;
        //clear stale screenshot from previous session
        ScreenshotHolder.clear();

        boolean screenshotPromised = (showFlags & VoiceInteractionSession.SHOW_WITH_SCREENSHOT) != 0;
        Log.d(TAG, "onShow flags=" + showFlags + " screenshotPromised=" + screenshotPromised);
        //overlay disables screen features without it
        ScreenshotHolder.setScreenAccess(screenshotPromised);

        //wait for promised screenshot
        if (screenshotPromised) {
            handler.postDelayed(startOverlayRunnable, 1000);
        } else {
            //without flag selection stays empty
            Log.w(TAG, "no screenshot promised by the system: enable 'Use screenshot' for this "
                    + "assistant in the android settings, otherwise selection stays empty");
            startOverlayActivity();
        }
    }

    private void startOverlayActivity() {
        if (activityStarted) return;
        activityStarted = true;
        handler.removeCallbacks(startOverlayRunnable);

        Intent intent = new Intent(getContext(), OverlayActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        boolean started = false;
        try {
            startAssistantActivity(intent);
            started = true;
        } catch (Exception e) {
            Log.w(TAG, "startAssistantActivity failed, trying startActivity: " + e.getMessage());
            try {
                getContext().startActivity(intent);
                started = true;
            } catch (Exception e2) {
                Log.e(TAG, "startActivity also failed: " + e2.getMessage());
            }
        }
        if (started) {
            hide();
        }
    }
}

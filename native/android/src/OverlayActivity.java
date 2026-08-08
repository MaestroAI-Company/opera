package __PACKAGE_NAME__;
import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;
import expo.modules.ReactActivityDelegateWrapper;
public class OverlayActivity extends ReactActivity {

    private static OverlayActivity sInstance;

    //close overlay only
    public static void finishOverlay() {
        final OverlayActivity activity = sInstance;
        if (activity == null) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (sInstance != null) sInstance.finish();
            }
        });
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(null);
        //keep the screen on while the overlay is visible
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        sInstance = this;
    }

    @Override
    protected void onDestroy() {
        if (sInstance == this) sInstance = null;
        super.onDestroy();
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        //activity reused, tell js to restart
        ScreenCaptureModule.emitOverlayReopened();
    }

    @Override
    protected String getMainComponentName() { return "AssistantOverlay"; }

    @Override
    protected ReactActivityDelegate createReactActivityDelegate() {
        return new ReactActivityDelegateWrapper(
            this,
            BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
            new DefaultReactActivityDelegate(
                this,
                getMainComponentName(),
                DefaultNewArchitectureEntryPoint.getFabricEnabled()
            )
        );
    }
}

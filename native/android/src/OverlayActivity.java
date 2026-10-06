package __PACKAGE_NAME__;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.WindowManager;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;
import expo.modules.ReactActivityDelegateWrapper;
public class OverlayActivity extends ReactActivity {

    private static OverlayActivity sInstance;
    //visible overlay ignores new invocations
    private static volatile boolean sShown;

    public static boolean isShown() {
        return sShown;
    }

    //sleep ends the overlay session
    private final BroadcastReceiver screenOffReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            finish();
        }
    };

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
        //keep screen awake while visible
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        sInstance = this;
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(screenOffReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(screenOffReceiver, filter);
        }
    }

    //own launches are not a leave
    private long launchedAt;

    @Override
    @SuppressWarnings("deprecation")
    public void startActivityForResult(Intent intent, int requestCode, Bundle options) {
        launchedAt = SystemClock.uptimeMillis();
        super.startActivityForResult(intent, requestCode, options);
    }

    //home or recents, js handles exit
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (SystemClock.uptimeMillis() - launchedAt > 1000) ScreenCaptureModule.emitOverlayLeaving();
    }

    @Override
    protected void onStart() {
        super.onStart();
        sShown = true;
    }

    @Override
    protected void onStop() {
        sShown = false;
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(screenOffReceiver);
        TextSelectionLayer.INSTANCE.hide();
        if (sInstance == this) sInstance = null;
        super.onDestroy();
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        //restart js on activity reuse
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

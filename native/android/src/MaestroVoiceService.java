package __PACKAGE_NAME__;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.provider.Settings;
import android.service.voice.VoiceInteractionService;
import android.util.Log;
import androidx.annotation.RequiresApi;
public class MaestroVoiceService extends VoiceInteractionService {

    private static final String TAG = "MaestroVoiceService";

    @Override
    public void onReady() {
        super.onReady();
    }

    @Override
    public void onLaunchVoiceAssistFromKeyguard() {
        Intent intent = new Intent(this, OverlayActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "onLaunchVoiceAssistFromKeyguard failed: " + e.getMessage());
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    public void onHandleScreenshot(Bitmap screenshot) {
        ScreenshotHolder.set(screenshot);
    }

    public static Intent createSettingsIntent() {
        return new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS);
    }
}

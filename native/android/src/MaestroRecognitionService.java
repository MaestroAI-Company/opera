package __PACKAGE_NAME__;
import android.speech.RecognitionService;
import android.content.Intent;
public class MaestroRecognitionService extends RecognitionService {
    @Override protected void onStartListening(Intent intent, Callback listener) {}
    @Override protected void onCancel(Callback listener) {}
    @Override protected void onStopListening(Callback listener) {}
}

package __PACKAGE_NAME__

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

//ongoing call card while maestro is live
class LiveCallService : Service() {
  companion object {
    const val ACTION_START = "live.start"
    const val ACTION_HANG_UP = "live.hangup"
    const val ACTION_MUTE = "live.mute"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_HANG_UP = "hangUpLabel"
    const val EXTRA_MUTE = "muteLabel"
    private const val CHANNEL_ID = "live_call"
    private const val NOTIFICATION_ID = 4217

    //set by the module to reach js
    var onAction: ((String) -> Unit)? = null
    //label updates keep the call timer
    private var startedAt = 0L
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_HANG_UP -> {
        onAction?.invoke("hangup")
        stopSelf()
        startedAt = 0L
      }
      ACTION_MUTE -> onAction?.invoke("mute")
      else -> if (intent != null) show(intent)
    }
    return START_NOT_STICKY
  }

  private fun actionIntent(action: String, code: Int): PendingIntent =
    PendingIntent.getService(
      this, code, Intent(this, LiveCallService::class.java).setAction(action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun show(intent: Intent) {
    val title = intent.getStringExtra(EXTRA_TITLE) ?: "Maestro"
    val text = intent.getStringExtra(EXTRA_TEXT) ?: ""
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, title, NotificationManager.IMPORTANCE_DEFAULT).apply { setSound(null, null) },
      )
    }
    //tapping the card reopens the live page
    val open = PendingIntent.getActivity(
      this, 0, packageManager.getLaunchIntentForPackage(packageName)?.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val hangUp = actionIntent(ACTION_HANG_UP, 1)
    val mute = actionIntent(ACTION_MUTE, 2)
    if (startedAt == 0L) startedAt = System.currentTimeMillis()
    val builder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this))
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(open)
      .setOngoing(true)
      .setUsesChronometer(true)
      .setWhen(startedAt)
      .setCategory(Notification.CATEGORY_CALL)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      //call style gets the status bar call chip
      val maestro = Person.Builder().setName(title).setImportant(true).build()
      builder.setStyle(Notification.CallStyle.forOngoingCall(maestro, hangUp))
    } else {
      builder.addAction(Notification.Action.Builder(null, intent.getStringExtra(EXTRA_HANG_UP), hangUp).build())
    }
    builder.addAction(Notification.Action.Builder(null, intent.getStringExtra(EXTRA_MUTE), mute).build())
    val notification = builder.build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  override fun onDestroy() {
    startedAt = 0L
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}

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
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.RectF
import android.graphics.drawable.Icon
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
    const val EXTRA_BASE = "butterflyBase"
    const val EXTRA_ACCENT = "butterflyAccent"
    const val EXTRA_COLOR = "accentColor"
    private const val CHANNEL_ID = "live_call"
    private const val NOTIFICATION_ID = 4217

    //set by the module to reach js
    var onAction: ((String) -> Unit)? = null
    //label updates keep the call timer
    private var startedAt = 0L
    //recomposed only when the butterfly changes
    private var avatarKey = ""
    private var avatar: Bitmap? = null
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

  //home butterfly drawn on its color
  private fun avatarFor(intent: Intent): Bitmap? {
    val base = intent.getStringExtra(EXTRA_BASE)?.takeIf { it.isNotEmpty() } ?: return null
    val accent = intent.getStringExtra(EXTRA_ACCENT)?.takeIf { it.isNotEmpty() } ?: return null
    val color = intent.getIntExtra(EXTRA_COLOR, Color.RED)
    val key = "$base|$accent|$color"
    if (key == avatarKey) return avatar
    val size = 256
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    //wings turn cream on the color
    canvas.drawColor(color)
    //inset keeps wings inside the round crop
    val target = RectF(size * 0.08f, size * 0.08f, size * 0.92f, size * 0.92f)
    val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    for ((path, tint) in listOf(base to null, accent to 0xFFFEFBF6.toInt())) {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(path, bounds)
      if (bounds.outWidth <= 0) return null
      val options = BitmapFactory.Options().apply { inSampleSize = maxOf(1, bounds.outWidth / (size * 2)) }
      val layer = BitmapFactory.decodeFile(path, options) ?: return null
      paint.colorFilter = tint?.let { PorterDuffColorFilter(it, PorterDuff.Mode.SRC_IN) }
      canvas.drawBitmap(layer, null, target, paint)
      layer.recycle()
    }
    avatarKey = key
    avatar = out
    return out
  }

  private fun show(intent: Intent) {
    val title = intent.getStringExtra(EXTRA_TITLE) ?: "Maestro"
    val text = intent.getStringExtra(EXTRA_TEXT) ?: ""
    val avatar = avatarFor(intent)
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
      //avatar of the pre-android 12 card
      .setLargeIcon(avatar)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      //call style gets the status bar call chip
      val person = Person.Builder().setName(title).setImportant(true)
      if (avatar != null) person.setIcon(Icon.createWithBitmap(avatar))
      builder.setStyle(Notification.CallStyle.forOngoingCall(person.build(), hangUp))
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

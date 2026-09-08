package __PACKAGE_NAME__

import android.app.Activity
import android.graphics.Point
import android.graphics.RectF
import android.os.Build
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout

private const val TAG = "TextSelectionLayer"

//keep words off the nav bars
private const val BOTTOM_GUARD = 140

object TextSelectionLayer {

  //normalized capture rectangle and its visual line
  data class Word(val x: Float, val y: Float, val w: Float, val h: Float, val text: String, val line: Int)

  @Volatile
  private var layer: View? = null

  //attach over the react root
  fun show(activity: Activity, words: List<Word>) {
    hide()
    if (words.isEmpty()) return

    val host = activity.findViewById<FrameLayout>(android.R.id.content) ?: return
    val display = displayBounds(activity)
    if (display.x <= 0 || display.y <= 0) return
    //capture spans the display not the host
    val origin = IntArray(2)
    host.getLocationOnScreen(origin)

    //no height yet keeps every word
    val floor = if (host.height > 0) host.height - BOTTOM_GUARD else Int.MAX_VALUE
    val placed = ArrayList<TextSelectionView.Word>(words.size)
    for (word in words) {
      val left = word.x * display.x - origin[0]
      val top = word.y * display.y - origin[1]
      val right = left + word.w * display.x
      val bottom = top + word.h * display.y
      if (right <= left || bottom <= top) continue
      if (bottom >= floor) continue
      placed.add(TextSelectionView.Word(RectF(left, top, right, bottom), word.text, word.line))
    }

    Log.i(TAG, "words=${words.size} placed=${placed.size} display=${display.x}x${display.y} host=${host.width}x${host.height} origin=${origin[0]},${origin[1]}")
    if (placed.isEmpty()) return

    val view = TextSelectionView(activity, placed)
    host.addView(
      view,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    )
    layer = view
  }

  fun hide() {
    val overlay = layer
    layer = null
    if (overlay != null) {
      (overlay.parent as? ViewGroup)?.removeView(overlay)
    }
  }

  @Suppress("DEPRECATION")
  private fun displayBounds(activity: Activity): Point {
    val manager = activity.windowManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = manager.maximumWindowMetrics.bounds
      return Point(bounds.width(), bounds.height())
    }
    val size = Point()
    manager.defaultDisplay.getRealSize(size)
    return size
  }
}

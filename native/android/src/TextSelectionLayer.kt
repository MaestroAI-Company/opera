package __PACKAGE_NAME__

import android.app.Activity
import android.graphics.Point
import android.graphics.RectF
import android.os.Build
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import kotlin.math.atan2

private const val TAG = "TextSelectionLayer"

//keep words off the nav bars
private const val BOTTOM_GUARD = 140

object TextSelectionLayer {

  //normalized clockwise corners from top left
  class Word(val corners: FloatArray, val text: String, val line: Int)

  @Volatile
  private var layer: View? = null

  //attach over the react root
  fun show(activity: Activity, words: List<Word>, onDragging: (Boolean) -> Unit) {
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
    //one angle per line
    val angles = words.groupBy { it.line }.mapValues { (_, line) ->
      var dx = 0f
      var dy = 0f
      for (word in line) {
        dx += (word.corners[2] - word.corners[0]) * display.x
        dy += (word.corners[3] - word.corners[1]) * display.y
      }
      Math.toDegrees(atan2(dy, dx).toDouble()).toFloat()
    }

    val placed = ArrayList<TextSelectionView.Word>(words.size)
    for (word in words) {
      val xs = FloatArray(4) { word.corners[2 * it] * display.x - origin[0] }
      val ys = FloatArray(4) { word.corners[2 * it + 1] * display.y - origin[1] }
      val bounds = RectF(xs.min(), ys.min(), xs.max(), ys.max())
      if (bounds.isEmpty) continue
      if (bounds.bottom >= floor) continue
      val placedWord = TextSelectionView.Word(RectF(), angles.getValue(word.line), bounds, word.text, word.line)
      val fx = FloatArray(4) { placedWord.frameX(xs[it], ys[it]) }
      val fy = FloatArray(4) { placedWord.frameY(xs[it], ys[it]) }
      placedWord.rect.set(fx.min(), fy.min(), fx.max(), fy.max())
      placed.add(placedWord)
    }

    Log.i(TAG, "words=${words.size} placed=${placed.size} display=${display.x}x${display.y} host=${host.width}x${host.height} origin=${origin[0]},${origin[1]}")
    if (placed.isEmpty()) return

    val view = TextSelectionView(activity, readingOrder(placed), onDragging)
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

  //ml kit emits blocks out of reading order
  private fun readingOrder(words: List<TextSelectionView.Word>): List<TextSelectionView.Word> {
    val groups = words.groupBy { it.line }.values.sortedBy { group -> group.minOf { it.bounds.top } }

    //a group joins the row while its middle stays above the floor
    val rows = mutableListOf<MutableList<List<TextSelectionView.Word>>>()
    var floor = 0f
    for (group in groups) {
      val top = group.minOf { it.bounds.top }
      val bottom = group.maxOf { it.bounds.bottom }
      if (rows.isEmpty() || (top + bottom) / 2f > floor) {
        rows.add(mutableListOf(group))
        floor = bottom
      } else {
        rows.last().add(group)
        floor = maxOf(floor, bottom)
      }
    }

    val ordered = ArrayList<TextSelectionView.Word>(words.size)
    var line = 0
    for (row in rows) {
      for (group in row.sortedBy { g -> g.minOf { it.bounds.left } }) {
        //frame left follows the text direction
        for (word in group.sortedBy { it.rect.left }) ordered.add(word.copy(line = line))
        line++
      }
    }
    return ordered
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

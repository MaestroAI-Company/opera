package __PACKAGE_NAME__

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.view.ActionMode
import android.view.HapticFeedbackConstants
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import kotlin.math.hypot

//matches the primarySelection token
private const val SELECTION_COLOR = 0x66FF1A1A

//join neighbours closer than this share of the line
private const val MERGE_GAP = 0.6f

//grab words a little outside their glyphs
private const val TOUCH_PAD = 0.4f

private const val COPY = 1
private const val SELECT_ALL = 2
private const val SHARE = 3

//owns every word so selection can cross lines
class TextSelectionView(context: Context, private val words: List<Word>) : View(context) {

  //placed word and the visual line it sits on
  data class Word(val rect: RectF, val text: String, val line: Int)

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = SELECTION_COLOR }
  private val radius = 4f * resources.displayMetrics.density
  private val slop = ViewConfiguration.get(context).scaledTouchSlop
  private val holdMs = ViewConfiguration.getLongPressTimeout().toLong()

  private var anchor = -1
  private var focus = -1
  private var selecting = false
  private var downX = 0f
  private var downY = 0f
  private var mode: ActionMode? = null

  private val startSelection = Runnable {
    val index = nearest(downX, downY)
    if (index >= 0) {
      anchor = index
      focus = index
      selecting = true
      performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
      openMode()
      invalidate()
    }
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        //the lasso keeps everything off the text
        if (hit(event.x, event.y) < 0) {
          clear()
          return false
        }
        downX = event.x
        downY = event.y
        postDelayed(startSelection, holdMs)
        return true
      }

      MotionEvent.ACTION_MOVE -> {
        if (selecting) {
          val index = nearest(event.x, event.y)
          if (index >= 0 && index != focus) {
            focus = index
            mode?.invalidateContentRect()
            invalidate()
          }
        } else if (hypot(event.x - downX, event.y - downY) > slop) {
          removeCallbacks(startSelection)
        }
        return true
      }

      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        removeCallbacks(startSelection)
        return true
      }
    }
    return false
  }

  override fun onDraw(canvas: Canvas) {
    if (!selecting) return
    val from = minOf(anchor, focus)
    val to = maxOf(anchor, focus)
    var i = from
    while (i <= to) {
      var last = i
      //one rect per run of touching words
      while (last + 1 <= to && joins(words[last], words[last + 1])) last++
      val bounds = RectF(words[i].rect)
      for (k in i..last) bounds.union(words[k].rect)
      canvas.drawRoundRect(bounds, radius, radius, fill)
      i = last + 1
    }
  }

  private fun joins(a: Word, b: Word): Boolean =
    a.line == b.line && b.rect.left - a.rect.right < a.rect.height() * MERGE_GAP

  //strict enough to leave the lasso alone
  private fun hit(x: Float, y: Float): Int {
    for (i in words.indices) {
      val rect = words[i].rect
      val pad = rect.height() * TOUCH_PAD
      if (x >= rect.left - pad && x <= rect.right + pad &&
        y >= rect.top - pad && y <= rect.bottom + pad
      ) return i
    }
    return -1
  }

  //drag never falls off the text
  private fun nearest(x: Float, y: Float): Int {
    var best = -1
    var shortest = Float.MAX_VALUE
    for (i in words.indices) {
      val rect = words[i].rect
      val dx = maxOf(rect.left - x, 0f, x - rect.right)
      val dy = maxOf(rect.top - y, 0f, y - rect.bottom)
      val distance = dx * dx + dy * dy
      if (distance < shortest) {
        shortest = distance
        best = i
      }
    }
    return best
  }

  private fun selectedText(): String {
    val from = minOf(anchor, focus)
    val to = maxOf(anchor, focus)
    val out = StringBuilder()
    for (i in from..to) {
      //line breaks survive the copy
      if (i > from) out.append(if (words[i].line == words[i - 1].line) " " else "\n")
      out.append(words[i].text)
    }
    return out.toString()
  }

  private fun selectionBounds(): Rect {
    val from = minOf(anchor, focus)
    val to = maxOf(anchor, focus)
    val bounds = RectF(words[from].rect)
    for (i in from..to) bounds.union(words[i].rect)
    return Rect(
      bounds.left.toInt(), bounds.top.toInt(),
      bounds.right.toInt(), bounds.bottom.toInt()
    )
  }

  private fun openMode() {
    if (mode != null) {
      mode?.invalidateContentRect()
      return
    }
    mode = startActionMode(object : ActionMode.Callback2() {
      override fun onCreateActionMode(active: ActionMode, menu: Menu): Boolean {
        menu.add(Menu.NONE, COPY, 0, "Copy")
        menu.add(Menu.NONE, SELECT_ALL, 1, "Select all")
        menu.add(Menu.NONE, SHARE, 2, "Share")
        return true
      }

      override fun onPrepareActionMode(active: ActionMode, menu: Menu): Boolean = false

      override fun onActionItemClicked(active: ActionMode, item: MenuItem): Boolean {
        when (item.itemId) {
          COPY -> {
            copySelection()
            active.finish()
          }
          SELECT_ALL -> {
            anchor = 0
            focus = words.size - 1
            active.invalidateContentRect()
            invalidate()
          }
          SHARE -> {
            shareSelection()
            active.finish()
          }
          else -> return false
        }
        return true
      }

      override fun onDestroyActionMode(active: ActionMode) {
        mode = null
        selecting = false
        invalidate()
      }

      override fun onGetContentRect(active: ActionMode, view: View, outRect: Rect) {
        outRect.set(selectionBounds())
      }
    }, ActionMode.TYPE_FLOATING)
  }

  private fun copySelection() {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    clipboard.setPrimaryClip(ClipData.newPlainText("text", selectedText()))
  }

  private fun shareSelection() {
    val intent = Intent(Intent.ACTION_SEND).apply {
      type = "text/plain"
      putExtra(Intent.EXTRA_TEXT, selectedText())
    }
    context.startActivity(Intent.createChooser(intent, null))
  }

  private fun clear() {
    if (!selecting) return
    selecting = false
    mode?.finish()
    mode = null
    invalidate()
  }
}

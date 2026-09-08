package __PACKAGE_NAME__

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.Drawable
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

private const val HANDLE_COLOR = 0xFFFF1A1A.toInt()

//join neighbours closer than this share of the line
private const val MERGE_GAP = 0.6f

//grab words a little outside their glyphs
private const val TOUCH_PAD = 0.4f

private const val HANDLE_LEFT_ANCHOR = 0.75f
private const val HANDLE_RIGHT_ANCHOR = 0.25f

private const val HANDLE_SLOP_DP = 8f

private const val NO_HANDLE = -1
private const val HANDLE_START = 0
private const val HANDLE_END = 1

private const val COPY = 1
private const val SELECT_ALL = 2
private const val SHARE = 3

//owns every word so selection can cross lines
class TextSelectionView(
  context: Context,
  private val words: List<Word>,
  private val onDragging: (Boolean) -> Unit
) : View(context) {

  //placed word and the visual line it sits on
  data class Word(val rect: RectF, val text: String, val line: Int)

  private val density = resources.displayMetrics.density
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = SELECTION_COLOR }
  private val radius = 4f * density
  private val handleSlop = HANDLE_SLOP_DP * density
  //the platform teardrops tinted to our primary
  private val leftHandle = systemHandle(android.R.attr.textSelectHandleLeft)
  private val rightHandle = systemHandle(android.R.attr.textSelectHandleRight)
  private val slop = ViewConfiguration.get(context).scaledTouchSlop
  private val holdMs = ViewConfiguration.getLongPressTimeout().toLong()

  private var anchor = -1
  private var focus = -1
  private var selecting = false
  private var dragging = false
  private var downX = 0f
  private var downY = 0f
  private var mode: ActionMode? = null

  init {
    isHapticFeedbackEnabled = true
  }

  //the overlay chrome hides while a selection moves
  private fun setDragging(active: Boolean) {
    if (dragging == active) return
    dragging = active
    onDragging(active)
  }

  //teardown must never leave the chrome hidden
  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    setDragging(false)
  }

  private val startSelection = Runnable {
    val index = locate(downX, downY)
    if (index >= 0) {
      anchor = index
      focus = index
      selecting = true
      setDragging(true)
      tick(HapticFeedbackConstants.LONG_PRESS)
      openMode()
      invalidate()
    }
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        //a handle grab beats everything else
        if (selecting) {
          val handle = handleAt(event.x, event.y)
          if (handle != NO_HANDLE) {
            val from = minOf(anchor, focus)
            val to = maxOf(anchor, focus)
            //the far end stays pinned
            anchor = if (handle == HANDLE_START) to else from
            focus = if (handle == HANDLE_START) from else to
            setDragging(true)
            return true
          }
        }
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
        if (dragging) {
          val index = locate(event.x, event.y)
          if (index >= 0 && index != focus) {
            focus = index
            tick(HapticFeedbackConstants.CLOCK_TICK)
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
        setDragging(false)
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

    //teardrops frame the selection
    handleBounds(HANDLE_START)?.let { box ->
      leftHandle?.setBounds(box.left.toInt(), box.top.toInt(), box.right.toInt(), box.bottom.toInt())
      leftHandle?.draw(canvas)
    }
    handleBounds(HANDLE_END)?.let { box ->
      rightHandle?.setBounds(box.left.toInt(), box.top.toInt(), box.right.toInt(), box.bottom.toInt())
      rightHandle?.draw(canvas)
    }
  }

  private fun systemHandle(attr: Int): Drawable? {
    val typed = context.obtainStyledAttributes(intArrayOf(attr))
    val drawable = typed.getDrawable(0)
    typed.recycle()
    drawable?.setTint(HANDLE_COLOR)
    return drawable
  }

  private fun handleBounds(handle: Int): RectF? {
    val from = minOf(anchor, focus)
    val to = maxOf(anchor, focus)
    if (from < 0) return null
    val start = handle == HANDLE_START
    val drawable = (if (start) leftHandle else rightHandle) ?: return null
    val edge = if (start) words[from].rect else words[to].rect
    val x = if (start) edge.left else edge.right
    val anchorAt = if (start) HANDLE_LEFT_ANCHOR else HANDLE_RIGHT_ANCHOR
    val left = x - drawable.intrinsicWidth * anchorAt
    return RectF(left, edge.bottom, left + drawable.intrinsicWidth, edge.bottom + drawable.intrinsicHeight)
  }

  private fun joins(a: Word, b: Word): Boolean =
    a.line == b.line && b.rect.left - a.rect.right < a.rect.height() * MERGE_GAP

  private fun handleAt(x: Float, y: Float): Int {
    if (grabs(handleBounds(HANDLE_START), x, y)) return HANDLE_START
    if (grabs(handleBounds(HANDLE_END), x, y)) return HANDLE_END
    return NO_HANDLE
  }

  private fun grabs(box: RectF?, x: Float, y: Float): Boolean {
    val target = box ?: return false
    return x >= target.left - handleSlop && x <= target.right + handleSlop &&
      y >= target.top - handleSlop && y <= target.bottom + handleSlop
  }

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

  //walk lines the way a text cursor would
  private fun locate(x: Float, y: Float): Int {
    var line = -1
    var closest = Float.MAX_VALUE
    for (word in words) {
      val gap = distance(y, word.rect.top, word.rect.bottom)
      if (gap < closest) {
        closest = gap
        line = word.line
      }
    }
    if (line < 0) return -1

    //x only picks within that line
    var best = -1
    var shortest = Float.MAX_VALUE
    for (i in words.indices) {
      if (words[i].line != line) continue
      val gap = distance(x, words[i].rect.left, words[i].rect.right)
      if (gap < shortest) {
        shortest = gap
        best = i
      }
    }
    return best
  }

  private fun distance(value: Float, low: Float, high: Float): Float = when {
    value < low -> low - value
    value > high -> value - high
    else -> 0f
  }

  private fun tick(feedback: Int) {
    performHapticFeedback(feedback, HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING)
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
        setDragging(false)
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
    setDragging(false)
    mode?.finish()
    mode = null
    invalidate()
  }
}

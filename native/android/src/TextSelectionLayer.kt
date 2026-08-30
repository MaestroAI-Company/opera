package __PACKAGE_NAME__

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.util.TypedValue
import android.view.ActionMode
import android.view.Gravity
import android.view.Menu
import android.view.MenuItem
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView

//keep blocks off the nav bars
private const val BOTTOM_GUARD = 140

object TextSelectionLayer {

  data class Block(val x: Int, val y: Int, val w: Int, val h: Int, val text: String, val lines: Int)

  @Volatile
  private var layer: FrameLayout? = null

  //attach over the react root
  fun show(activity: Activity, blocks: List<Block>) {
    hide()

    val host = activity.findViewById<FrameLayout>(android.R.id.content) ?: return
    //no height yet drops every block
    val surface = if (host.height > 0) blocks.filter { it.y + it.h < host.height - BOTTOM_GUARD } else blocks
    if (surface.isEmpty()) return

    val overlay = FrameLayout(activity).apply {
      setBackgroundColor(Color.TRANSPARENT)
      isClickable = false
      setWillNotDraw(true)
    }
    host.addView(
      overlay,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    )
    layer = overlay

    for (block in surface) {
      overlay.addView(textView(activity, block), FrameLayout.LayoutParams(block.w, block.h).apply {
        leftMargin = block.x
        topMargin = block.y
      })
    }
  }

  fun hide() {
    val overlay = layer
    layer = null
    if (overlay != null) {
      (overlay.parent as? ViewGroup)?.removeView(overlay)
    }
  }

  private fun textView(context: Context, block: Block): TextView =
    TextView(context).apply {
      text = block.text
      setTextIsSelectable(true)
      //capture shows the text underneath
      setTextColor(Color.TRANSPARENT)
      //matches the primarySelection token
      setHighlightColor(0x66FF1A1A.toInt())
      setIncludeFontPadding(false)
      typeface = Typeface.MONOSPACE
      gravity = Gravity.CENTER_VERTICAL
      //size glyphs to fill the box
      val rows = block.lines.coerceAtLeast(1)
      setTextSize(TypedValue.COMPLEX_UNIT_PX, block.h / rows.toFloat())
      setCustomSelectionActionModeCallback(object : ActionMode.Callback {
        override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
          menu.add(Menu.NONE, android.R.id.selectAll, 0, "Select all")
            .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
          menu.add(Menu.NONE, android.R.id.shareText, 1, "Share")
            .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
          return true
        }

        override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean = true

        override fun onDestroyActionMode(mode: ActionMode) = Unit

        //copy and share stay default
        override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean = false
      })
    }
}
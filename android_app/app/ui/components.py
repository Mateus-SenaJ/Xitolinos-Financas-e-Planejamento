from kivy.metrics import dp, sp
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label

INK = (0.12, 0.16, 0.14, 1)
MUTED = (0.43, 0.48, 0.44, 1)
GREEN = (0.19, 0.37, 0.29, 1)
WHITE = (1, 1, 1, 1)
ORANGE = (0.66, 0.43, 0.08, 1)


class FinancialCard(BoxLayout):
    def __init__(self, title: str, value: str, detail: str, **kwargs):
        super().__init__(orientation="vertical", padding=(dp(16), dp(12)), spacing=dp(4),
                         size_hint_y=None, height=dp(106), **kwargs)
        self.add_widget(Label(text=title, color=MUTED, font_size=sp(12), halign="left",
                              valign="middle", size_hint_y=None, height=dp(20)))
        self.add_widget(Label(text=value, color=INK, bold=True, font_size=sp(22), halign="left",
                              valign="middle", size_hint_y=None, height=dp(34)))
        self.add_widget(Label(text=detail, color=MUTED, font_size=sp(11), halign="left",
                              valign="middle", size_hint_y=None, height=dp(20)))


class EmptyState(BoxLayout):
    def __init__(self, title: str, detail: str, **kwargs):
        super().__init__(orientation="vertical", padding=dp(18), spacing=dp(8),
                         size_hint_y=None, height=dp(120), **kwargs)
        self.add_widget(Label(text=title, color=INK, bold=True, font_size=sp(14), halign="center"))
        self.add_widget(Label(text=detail, color=MUTED, font_size=sp(11), halign="center"))


def action_button(text: str, callback, *, primary: bool = False, disabled: bool = False) -> Button:
    button = Button(text=text, size_hint_y=None, height=dp(46), font_size=sp(13),
                    background_normal="", background_color=GREEN if primary else WHITE,
                    color=WHITE if primary else INK, disabled=disabled)
    button.bind(on_release=callback)
    return button
from datetime import date
from pathlib import Path

from kivy.app import App
from kivy.metrics import dp, sp
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.gridlayout import GridLayout
from kivy.uix.label import Label
from kivy.uix.popup import Popup
from kivy.uix.screenmanager import Screen, ScreenManager
from kivy.uix.scrollview import ScrollView
from kivy.uix.spinner import Spinner
from kivy.uix.textinput import TextInput

from app.bootstrap import initialize_defaults
from app.core.constants import AccountType, TransactionType
from app.core.exceptions import DomainError
from app.core.money import format_cents, parse_cents
from app.core.security import UnavailableBiometricAuthenticator
from app.services.container import build_services
from app.ui.components import EmptyState, FinancialCard, GREEN, INK, MUTED, WHITE, ORANGE, action_button

NAV_ITEMS = (("home", "Início"), ("history", "Histórico"), ("planning", "Planejar"),
             ("reports", "Relatórios"), ("more", "Mais"))


class UnlockScreen(Screen):
    def __init__(self, app_ref, **kwargs):
        super().__init__(name="unlock", **kwargs)
        self.app_ref = app_ref
        root = BoxLayout(orientation="vertical", padding=(dp(26), dp(48)), spacing=dp(14))
        root.add_widget(Label(text="saldo", color=GREEN, bold=True, font_size=sp(28),
                              size_hint_y=None, height=dp(58)))
        configured = self.app_ref.services.security.store.read_pin_record() is not None
        title = "Desbloqueie suas finanças" if configured else "Proteja seus dados com um PIN"
        root.add_widget(Label(text=title, color=INK, font_size=sp(17), size_hint_y=None, height=dp(42)))
        self.pin_input = TextInput(password=True, input_filter="int", multiline=False,
                                   hint_text="PIN de 6 a 12 dígitos", size_hint_y=None,
                                   height=dp(48), font_size=sp(18))
        root.add_widget(self.pin_input)
        self.confirm_input = None
        if not configured:
            self.confirm_input = TextInput(password=True, input_filter="int", multiline=False,
                                           hint_text="Confirme o PIN", size_hint_y=None,
                                           height=dp(48), font_size=sp(18))
            root.add_widget(self.confirm_input)
        root.add_widget(action_button("Continuar", self.submit, primary=True))
        self.message = Label(text="", color=ORANGE, font_size=sp(12), size_hint_y=None, height=dp(48))
        root.add_widget(self.message)
        if not UnavailableBiometricAuthenticator().is_available():
            root.add_widget(Label(text="Biometria ainda não está conectada nesta compilação. Use o PIN local.",
                                  color=MUTED, font_size=sp(10), size_hint_y=None, height=dp(40)))
        self.add_widget(root)

    def submit(self, *_):
        try:
            record = self.app_ref.services.security.store.read_pin_record()
            if record is None:
                if self.pin_input.text != self.confirm_input.text:
                    self.message.text = "Os PINs não coincidem."
                    return
                self.app_ref.services.security.configure(self.pin_input.text)
            elif not self.app_ref.services.security.verify(self.pin_input.text):
                self.message.text = "PIN incorreto. Tente novamente."
                self.pin_input.text = ""
                return
            self.app_ref.open_finance()
        except DomainError as error:
            self.message.text = str(error)
        except Exception:
            self.message.text = "Não foi possível desbloquear. Tente novamente."


class FinanceScreen(Screen):
    def __init__(self, app_ref, screen_name: str, **kwargs):
        super().__init__(name=screen_name, **kwargs)
        self.app_ref = app_ref
        self.root_layout = BoxLayout(orientation="vertical", spacing=dp(8), padding=(dp(16), dp(12)))
        self.header = BoxLayout(size_hint_y=None, height=dp(46), spacing=dp(8))
        self.title = Label(text="", color=INK, bold=True, font_size=sp(20), halign="left")
        self.header.add_widget(self.title)
        if screen_name == "home":
            self.header.add_widget(action_button("+", self.open_quick_entry, primary=True))
        self.root_layout.add_widget(self.header)
        self.scroll = ScrollView(do_scroll_x=False)
        self.content = BoxLayout(orientation="vertical", spacing=dp(10), size_hint_y=None,
                                 padding=(0, 0, 0, dp(12)))
        self.content.bind(minimum_height=self.content.setter("height"))
        self.scroll.add_widget(self.content)
        self.root_layout.add_widget(self.scroll)
        self.nav = GridLayout(cols=5, size_hint_y=None, height=dp(58), spacing=dp(2))
        for name, label in NAV_ITEMS:
            button = Button(text=label, font_size=sp(10),
                            color=GREEN if name == screen_name else MUTED,
                            background_normal="", background_color=WHITE)
            button.bind(on_release=lambda _button, target=name: self.app_ref.show_screen(target))
            self.nav.add_widget(button)
        self.root_layout.add_widget(self.nav)
        self.add_widget(self.root_layout)

    def on_pre_enter(self, *_):
        self.refresh()

    def refresh(self):
        self.content.clear_widgets()
        self.title.text = dict(NAV_ITEMS)[self.name]
        renderers = {"home": self._render_home, "history": self._render_history,
                     "planning": self._render_planning, "reports": self._render_reports,
                     "more": self._render_more}
        renderers[self.name]()

    def _render_home(self):
        summary = self.app_ref.services.ledger.summarize(date.today().strftime("%Y-%m"), through=date.today())
        liquid_count = sum(1 for item in summary.accounts if item.account.is_liquid)
        self.content.add_widget(FinancialCard("Saldo líquido", format_cents(summary.net_balance_cents),
                                              f"{liquid_count} conta(s) líquida(s)"))
        self.content.add_widget(FinancialCard("Entradas no mês", format_cents(summary.income_cents),
                                              f"{len(summary.income_explanation.records)} registro(s)"))
        self.content.add_widget(FinancialCard("Despesas no mês", format_cents(summary.expense_cents),
                                              f"{len(summary.expense_explanation.records)} registro(s)"))
        self.content.add_widget(Label(text="Compromissos e previsão", color=INK, bold=True,
                                      size_hint_y=None, height=dp(32), halign="left"))
        self.content.add_widget(EmptyState("Previsão ainda não disponível",
                                           "Faturas, recorrências e compromissos futuros não estão implementados."))
        self.content.add_widget(Label(text="Movimentações recentes", color=INK, bold=True,
                                      size_hint_y=None, height=dp(32), halign="left"))
        recent = self.app_ref.services.transactions.list_active()[:5]
        if not recent:
            self.content.add_widget(EmptyState("Sem movimentações", "Use + para registrar uma receita, despesa ou transferência."))
        for item in recent:
            self.content.add_widget(self._transaction_row(item))

    def _render_history(self):
        self.content.add_widget(action_button("＋ Novo lançamento", self.open_quick_entry, primary=True))
        items = self.app_ref.services.transactions.list_active()
        if not items:
            self.content.add_widget(EmptyState("Histórico vazio", "Os lançamentos registrados aparecerão aqui."))
        for item in items:
            row = BoxLayout(size_hint_y=None, height=dp(52), spacing=dp(8))
            row.add_widget(Label(text=f"{item.description}\n{item.date.strftime('%d/%m')} · {item.category}",
                                 color=INK, halign="left", font_size=sp(11)))
            row.add_widget(Label(text=format_cents(item.amount_cents), color=INK, font_size=sp(12), size_hint_x=.45))
            row.add_widget(action_button("Lixeira", lambda _button, transaction_id=item.id: self.trash_transaction(transaction_id)))
            self.content.add_widget(row)

    def _render_planning(self):
        self.content.add_widget(EmptyState("Previsão indisponível",
                                           "O motor de previsão será implementado após contas a pagar, recebíveis e recorrências."))
        self.content.add_widget(EmptyState("Posso fazer este gasto?",
                                           "Nenhum veredito é exibido antes de existir projeção e margem configurável."))

    def _render_reports(self):
        summary = self.app_ref.services.ledger.summarize(date.today().strftime("%Y-%m"), through=date.today())
        self.content.add_widget(FinancialCard("Receitas", format_cents(summary.income_cents), "Realizado no mês"))
        self.content.add_widget(FinancialCard("Despesas", format_cents(summary.expense_cents), "Realizado no mês"))
        self.content.add_widget(FinancialCard("Saldo líquido", format_cents(summary.net_balance_cents), "Calculado pelo ledger local"))
        self.content.add_widget(EmptyState("Relatórios analíticos pendentes",
                                           "Comparativos, médias e exportação serão entregues em fase própria."))

    def _render_more(self):
        self.content.add_widget(action_button("＋ Nova conta", self.open_account_entry, primary=True))
        for item in self.app_ref.services.accounts.list_all():
            self.content.add_widget(Label(text=f"{item.name} · {item.status.value}", color=INK,
                                          size_hint_y=None, height=dp(36), halign="left"))
        self.content.add_widget(action_button("＋ Categoria", self.open_category_entry))
        for item in self.app_ref.services.categories.list_all():
            self.content.add_widget(Label(text=f"{item.name} · {item.type}", color=MUTED,
                                          size_hint_y=None, height=dp(30), halign="left"))
        audit = self.app_ref.services.audit.recent(20)
        self.content.add_widget(Label(text="Atividade recente", color=INK, bold=True,
                                      size_hint_y=None, height=dp(36), halign="left"))
        for event in audit:
            self.content.add_widget(Label(text=f"{event['entity_type']} · {event['action']} · {event['created_at']}",
                                          color=MUTED, size_hint_y=None, height=dp(30), halign="left", font_size=sp(10)))
        self.content.add_widget(Label(text="Preferências de planejamento", color=INK, bold=True,
                                      size_hint_y=None, height=dp(36), halign="left"))
        settings = self.app_ref.services.settings.get()
        margin = TextInput(text=f"{settings['minimum_margin_cents'] / 100:.2f}",
                           hint_text="Margem mínima em R$", input_filter="float", multiline=False,
                           size_hint_y=None, height=dp(44))
        horizon = Spinner(text=f"{settings['forecast_horizon_days']} dias",
                          values=("7 dias", "30 dias", "90 dias", "180 dias", "365 dias"),
                          size_hint_y=None, height=dp(44))
        message = Label(text="", color=ORANGE, size_hint_y=None, height=dp(34), font_size=sp(11))
        self.content.add_widget(margin)
        self.content.add_widget(horizon)
        self.content.add_widget(action_button("Salvar preferências", lambda _button: self._save_settings(margin, horizon, message)))
        self.content.add_widget(message)
        self.content.add_widget(EmptyState("Cartões, importações, previsão e backup",
                                           "Planejados para próximas fases; ainda indisponíveis nesta versão."))

    def _save_settings(self, margin_input: TextInput, horizon_spinner: Spinner, message: Label):
        try:
            margin_text = margin_input.text.strip()
            margin_cents = 0 if margin_text in ("0", "0.00", "0,00") else parse_cents(margin_text)
            horizon_days = int(horizon_spinner.text.split()[0])
            self.app_ref.services.settings.set_minimum_margin(margin_cents)
            self.app_ref.services.settings.set_forecast_horizon(horizon_days)
            message.text = "Preferências salvas neste dispositivo."
        except DomainError as error:
            message.text = str(error)

    def _transaction_row(self, item):
        return Label(text=f"{item.description} · {item.date.strftime('%d/%m')} · {format_cents(item.amount_cents)}",
                     color=INK, size_hint_y=None, height=dp(38), font_size=sp(11), halign="left")

    def open_quick_entry(self, *_):
        QuickEntryPopup(self.app_ref, on_saved=self.app_ref.refresh_current).open()

    def open_account_entry(self, *_):
        content = BoxLayout(orientation="vertical", spacing=dp(8), padding=dp(12))
        name = TextInput(hint_text="Nome da conta", multiline=False, size_hint_y=None, height=dp(44))
        kind = Spinner(text="Conta corrente", values=("Conta corrente", "Conta digital", "Dinheiro", "Poupança"),
                       size_hint_y=None, height=dp(44))
        message = Label(text="", color=ORANGE, size_hint_y=None, height=dp(32))
        for widget in (name, kind, message):
            content.add_widget(widget)
        popup = Popup(title="Nova conta", content=content, size_hint=(.92, None), height=dp(260))
        def save(_button):
            try:
                kind_map = {"Conta corrente": AccountType.CHECKING, "Conta digital": AccountType.DIGITAL,
                            "Dinheiro": AccountType.CASH, "Poupança": AccountType.SAVINGS}
                self.app_ref.services.accounts.create(name=name.text, account_type=kind_map[kind.text])
                popup.dismiss()
                self.app_ref.refresh_current()
            except DomainError as error:
                message.text = str(error)
        content.add_widget(action_button("Salvar conta", save, primary=True))
        popup.open()

    def open_category_entry(self, *_):
        content = BoxLayout(orientation="vertical", spacing=dp(8), padding=dp(12))
        name = TextInput(hint_text="Nome da categoria", multiline=False, size_hint_y=None, height=dp(44))
        kind = Spinner(text="Despesa", values=("Despesa", "Receita"), size_hint_y=None, height=dp(44))
        message = Label(text="", color=ORANGE, size_hint_y=None, height=dp(32))
        for widget in (name, kind, message):
            content.add_widget(widget)
        popup = Popup(title="Nova categoria", content=content, size_hint=(.92, None), height=dp(255))
        def save(_button):
            try:
                self.app_ref.services.categories.create(name=name.text,
                    category_type="income" if kind.text == "Receita" else "expense")
                popup.dismiss()
                self.app_ref.refresh_current()
            except DomainError as error:
                message.text = str(error)
        content.add_widget(action_button("Salvar categoria", save, primary=True))
        popup.open()

    def trash_transaction(self, transaction_id: str):
        self.app_ref.services.transactions.soft_delete(transaction_id)
        self.app_ref.refresh_current()


class QuickEntryPopup(Popup):
    def __init__(self, app_ref, on_saved, **kwargs):
        super().__init__(title="Novo lançamento", size_hint=(.94, .86), auto_dismiss=True, **kwargs)
        self.app_ref = app_ref
        self.on_saved = on_saved
        self.content_box = BoxLayout(orientation="vertical", spacing=dp(8), padding=dp(12))
        self.description = TextInput(hint_text="Descrição", multiline=False, size_hint_y=None, height=dp(44))
        self.amount = TextInput(hint_text="Valor (ex.: 10,50)", multiline=False,
                                size_hint_y=None, height=dp(44))
        self.kind = Spinner(text="Despesa", values=("Despesa", "Receita", "Transferência"),
                            size_hint_y=None, height=dp(44))
        self.account = Spinner(text="Conta principal", values=(), size_hint_y=None, height=dp(44))
        self.category = Spinner(text="Categoria", values=(), size_hint_y=None, height=dp(44))
        self.destination = Spinner(text="Conta destino", values=(), size_hint_y=None, height=dp(44))
        self.message = Label(text="", color=ORANGE, size_hint_y=None, height=dp(38), font_size=sp(11))
        for widget in (self.description, self.amount, self.kind, self.account, self.category,
                       self.destination, self.message):
            self.content_box.add_widget(widget)
        self.content_box.add_widget(action_button("Salvar", self.save, primary=True))
        self.content = self.content_box
        self.kind.bind(text=self.refresh_choices)
        self.refresh_choices()

    def refresh_choices(self, *_):
        kind = {"Despesa": "expense", "Receita": "income", "Transferência": "transfer"}[self.kind.text]
        categories = self.app_ref.services.categories.list_all()
        category_names = tuple(item.name for item in categories if item.type == kind)
        self.category.values = category_names or ("Transferência",)
        if category_names and self.category.text not in category_names:
            self.category.text = category_names[0]
        accounts = [item.name for item in self.app_ref.services.accounts.list_all() if item.status.value == "active"]
        self.account.values = tuple(accounts)
        self.destination.values = tuple(accounts)
        if accounts and self.account.text not in accounts:
            self.account.text = accounts[0]
        if len(accounts) > 1 and self.destination.text == self.account.text:
            self.destination.text = accounts[1]
        self.destination.opacity = 1 if kind == "transfer" else 0
        self.destination.disabled = kind != "transfer"

    def save(self, *_):
        try:
            kind = {"Despesa": TransactionType.EXPENSE, "Receita": TransactionType.INCOME,
                    "Transferência": TransactionType.TRANSFER}[self.kind.text]
            accounts = self.app_ref.services.accounts.list_all()
            source = next(item for item in accounts if item.name == self.account.text and item.status.value == "active")
            destination_id = None
            if kind == TransactionType.TRANSFER:
                destination = next(item for item in accounts if item.name == self.destination.text and item.status.value == "active")
                destination_id = destination.id
            self.app_ref.services.transaction_service.create(
                description=self.description.text, amount_cents=parse_cents(self.amount.text),
                transaction_date=date.today().isoformat(), transaction_type=kind, account_id=source.id,
                category_name="Transferência" if kind == TransactionType.TRANSFER else self.category.text,
                counterparty_account_id=destination_id)
            self.dismiss()
            self.on_saved()
        except (DomainError, StopIteration, ValueError) as error:
            self.message.text = str(error) or "Confira os campos informados."


class SaldoAndroidApp(App):
    title = "Saldo"

    def build(self):
        self.services = build_services(str(Path(self.user_data_dir) / "saldo.sqlite3"))
        initialize_defaults(self.services.database)
        self.manager = ScreenManager()
        self.manager.add_widget(UnlockScreen(self))
        for screen_name, _label in NAV_ITEMS:
            self.manager.add_widget(FinanceScreen(self, screen_name))
        self.manager.current = "unlock"
        return self.manager

    def show_screen(self, name: str):
        self.manager.current = name

    def refresh_current(self):
        screen = self.manager.get_screen(self.manager.current)
        if isinstance(screen, FinanceScreen):
            screen.refresh()

    def open_finance(self):
        self.manager.current = "home"

    def on_pause(self):
        if hasattr(self, "manager") and self.services.security.store.read_pin_record() is not None:
            self.manager.current = "unlock"
        return True
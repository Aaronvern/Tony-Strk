//! ERC20s that misbehave in the specific ways a paywall helper has to survive.
//!
//! Test-only. Both are deliberately minimal: just enough of the ERC20 surface
//! for `privacy_invoke` to run against, plus one hostile behaviour each.

use starknet::ContractAddress;

/// Test-only controls, kept off the ERC20 interface.
#[starknet::interface]
pub trait IHostileToken<T> {
    fn mint(ref self: T, recipient: ContractAddress, amount: u256);
}

/// Arms the re-entrant token with the call it should make back into the helper.
#[starknet::interface]
pub trait IReentrancyControl<T> {
    fn arm(
        ref self: T,
        helper: ContractAddress,
        merchant: ContractAddress,
        price: u128,
        resource_hash: felt252,
        note_id: felt252,
    );
}

/// An ERC20 that skims a flat fee off every transfer: the sender is debited
/// `amount`, the recipient is credited `amount - fee`. Real tokens do this.
#[starknet::contract]
pub mod FeeOnTransferToken {
    use openzeppelin::interfaces::token::erc20::IERC20;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use super::IHostileToken;

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        total_supply: u256,
        fee: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, fee: u256) {
        self.fee.write(fee);
    }

    #[abi(embed_v0)]
    impl HostileTokenImpl of IHostileToken<ContractState> {
        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            self.total_supply.write(self.total_supply.read() + amount);
        }
    }

    #[abi(embed_v0)]
    impl ERC20Impl of IERC20<ContractState> {
        fn total_supply(self: @ContractState) -> u256 {
            self.total_supply.read()
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.entry((owner, spender)).read()
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = get_caller_address();
            let credited = amount - self.fee.read();
            self.balances.entry(sender).write(self.balances.entry(sender).read() - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + credited);
            // Reports success while quietly delivering less. The point of the
            // test: the return value is not evidence.
            true
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let spender = get_caller_address();
            let allowance = self.allowances.entry((sender, spender)).read();
            self.allowances.entry((sender, spender)).write(allowance - amount);
            let credited = amount - self.fee.read();
            self.balances.entry(sender).write(self.balances.entry(sender).read() - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + credited);
            true
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.allowances.entry((get_caller_address(), spender)).write(amount);
            true
        }
    }
}

/// An ERC20 whose `transfer` calls back into the helper before settling,
/// trying to get the merchant paid twice out of one funding.
#[starknet::contract]
pub mod ReentrantToken {
    use openzeppelin::interfaces::token::erc20::IERC20;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};

    use paywall_anonymizer::paywall_anonymizer::{
        IPaywallAnonymizerDispatcher, IPaywallAnonymizerDispatcherTrait,
    };
    use super::{IHostileToken, IReentrancyControl};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        total_supply: u256,
        helper: ContractAddress,
        merchant: ContractAddress,
        price: u128,
        resource_hash: felt252,
        note_id: felt252,
        armed: bool,
        entered: bool,
    }

    #[abi(embed_v0)]
    impl HostileTokenImpl of IHostileToken<ContractState> {
        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            self.total_supply.write(self.total_supply.read() + amount);
        }
    }

    #[abi(embed_v0)]
    impl ReentrancyControlImpl of IReentrancyControl<ContractState> {
        fn arm(
            ref self: ContractState,
            helper: ContractAddress,
            merchant: ContractAddress,
            price: u128,
            resource_hash: felt252,
            note_id: felt252,
        ) {
            self.helper.write(helper);
            self.merchant.write(merchant);
            self.price.write(price);
            self.resource_hash.write(resource_hash);
            self.note_id.write(note_id);
            self.armed.write(true);
        }
    }

    #[abi(embed_v0)]
    impl ERC20Impl of IERC20<ContractState> {
        fn total_supply(self: @ContractState) -> u256 {
            self.total_supply.read()
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.entry((owner, spender)).read()
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            // Re-enter once, before settling, while the outer call has already
            // taken its "before" readings.
            if self.armed.read() && !self.entered.read() {
                self.entered.write(true);
                IPaywallAnonymizerDispatcher { contract_address: self.helper.read() }
                    .privacy_invoke(
                        merchant: self.merchant.read(),
                        token: get_contract_address(),
                        price: self.price.read(),
                        resource_hash: self.resource_hash.read(),
                        change_note_id: Some(self.note_id.read()),
                    );
            }

            let sender = get_caller_address();
            self.balances.entry(sender).write(self.balances.entry(sender).read() - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            true
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let spender = get_caller_address();
            let allowance = self.allowances.entry((sender, spender)).read();
            self.allowances.entry((sender, spender)).write(allowance - amount);
            self.balances.entry(sender).write(self.balances.entry(sender).read() - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            true
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.allowances.entry((get_caller_address(), spender)).write(amount);
            true
        }
    }
}

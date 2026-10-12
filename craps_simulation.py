"""

Craps Baby!
Ethan-da-Tech-Wizard
09/12/2026
I will be simulating the game of craps. The user will roll two dice and the program will determine if they win or lose based on the rules of craps. If the user does not win or lose on the first roll, they will continue to roll until they either roll their point again (and win) or roll a 7 (and lose).

"""

import random

input("Press enter to roll the two dice.")
die1 = random.randint(1, 6)
die2 = random.randint(1, 6)
die_sum = die1 + die2
total_rolls = 1
print("You rolled a", die1, "and a", die2, "for a total of", die_sum)
if die_sum == 7 or die_sum == 11:
    print("You are a winner in one roll of the dice!")
elif die_sum == 2 or die_sum == 3 or die_sum == 12:
    print("You are a loser in one roll of the dice!")
else:
    point = die_sum
    print("Your point is", point)
    game_over = False
    while not game_over:
        input("Press enter to roll the two dice.")
        die1 = random.randint(1, 6)
        die2 = random.randint(1, 6)
        die_sum = die1 + die2
        total_rolls = 2
        print("You rolled a", die1, "and a", die2, "for a total of", die_sum)
        if die_sum == point:
            print(f"You rolled your point! You win on roll number {total_rolls}.")
            game_over = True
        elif die_sum == 7: 
                print(f"You rolled a 7! You lose on roll number {total_rolls}.")
                game_over = True
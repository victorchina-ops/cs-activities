using System;

class Program
{
    static int Total(int price, int count)
    {
        return price * count;
    }

    static void Main()
    {
        int sandwichPrice = int.Parse(Console.ReadLine());
        int sandwichCount = int.Parse(Console.ReadLine());
        int drinkPrice = int.Parse(Console.ReadLine());
        int drinkCount = int.Parse(Console.ReadLine());
        int paid = int.Parse(Console.ReadLine());
        int sum = Total(sandwichPrice, sandwichCount) + Total(drinkPrice, drinkCount);
        int change = paid - sum;
        int coins = change / 10;
        int rest = change % 10;
        Console.WriteLine("סך הכל: " + sum);
        Console.WriteLine("עודף: " + change);
        Console.WriteLine("מטבעות של עשר: " + coins);
        Console.WriteLine("שארית בעודף: " + rest);
    }
}
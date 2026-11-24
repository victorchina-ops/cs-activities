using System;

class Program
{
    static void Main()
    {
        int age = int.Parse(Console.ReadLine());
        int h = int.Parse(Console.ReadLine());
        if (age >= 8)
        {
            if (h >= 120)
            {
                if (age >= 12) Console.WriteLine("allowed");
                else Console.WriteLine("parent");
            }
            else Console.WriteLine("too short");
        }
        else Console.WriteLine("too young");
    }
}
